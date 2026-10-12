#!/usr/bin/env python3
"""Verify a ManageRent4U application backup; restore only with explicit --apply."""
import argparse, hashlib, json, os, re, urllib.request, urllib.parse, urllib.error, zipfile
from pathlib import Path

def api(base,key,route,data=None,method='GET',content_type='application/json',prefer=None):
    headers={'apikey':key,'Content-Type':content_type}
    if not key.startswith('sb_secret_'): headers['Authorization']='Bearer '+key
    if prefer: headers['Prefer']=prefer
    payload=data if isinstance(data,bytes) else json.dumps(data).encode() if data is not None else None
    request=urllib.request.Request(base+route,data=payload,headers=headers,method=method)
    with urllib.request.urlopen(request,timeout=90) as response:
        raw=response.read()
        return json.loads(raw) if raw and 'json' in response.headers.get('Content-Type','') else raw

def order_tables(tables,schema):
    dependencies={table:set() for table in tables}
    for item in (schema or {}).get('constraints',[]):
        table=item['table'].replace('public.','').strip('"')
        match=re.search(r'REFERENCES\s+(?:public\.)?"?(\w+)"?',item.get('definition',''))
        if table in dependencies and match and match[1] in dependencies and match[1]!=table:
            dependencies[table].add(match[1])
    # Normal dependency order for profile exports, which intentionally omit global schema definitions.
    baseline=['workspaces','owners','buildings','units','tenants','tenant_units','owner_bank_accounts','payments','payment_entries','tenant_adjustments','utility_ean_codes','meter_readings','utility_tariffs','contract_intakes','bank_connections','bank_accounts','bank_transactions','tenant_messages','tenant_message_events','tenant_reminders','tenant_indexations','expense_records','custom_reminders','user_profiles','workspace_memberships','share_links','mr4u_backup_preferences','mr4u_payment_receipts','mr4u_login_security','mr4u_passkeys']
    remaining=set(tables);ordered=[]
    while remaining:
        ready=sorted((t for t in remaining if not dependencies[t]&remaining),key=lambda t:(baseline.index(t) if t in baseline else len(baseline),t))
        if not ready: raise SystemExit('Foreign-key cycle detected. Restore these tables manually: '+', '.join(sorted(remaining)))
        ordered.extend(ready);remaining.difference_update(ready)
    return ordered

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('archive');parser.add_argument('--apply',action='store_true');parser.add_argument('--restore-profiles',action='store_true');parser.add_argument('--restore-schedules',action='store_true');parser.add_argument('--tables',help='Optional comma-separated table selection')
    args=parser.parse_args()
    with zipfile.ZipFile(args.archive) as archive:
        bad=archive.testzip()
        if bad: raise SystemExit('Corrupted ZIP entry: '+bad)
        manifest=json.loads(archive.read('manifest.json'))
        if not manifest.get('complete'): raise SystemExit('Archive is not marked complete')
        for item in manifest['files']:
            data=archive.read(item['path'])
            if len(data)!=item['size'] or hashlib.sha256(data).hexdigest()!=item['sha256']:
                raise SystemExit('Checksum mismatch: '+item['path'])
        snapshot=json.loads(archive.read('database.json'));tables=snapshot['tables']
        if args.tables:
            chosen=args.tables.split(',');missing=[t for t in chosen if t not in tables]
            if missing: raise SystemExit('Tables absent from this backup: '+', '.join(missing))
            tables={t:tables[t] for t in chosen}
        print('Verified backup:',manifest['scope'],manifest['captured_at'])
        print('Tables:',len(tables),'Rows:',sum(map(len,tables.values())),'Files:',len(manifest['files']))
        if not args.apply:
            print('Verification only. No remote data changed. Read RESTORE.txt before using --apply against a staging project.')
            return
        base=os.environ.get('SUPABASE_URL','').rstrip('/');key=os.environ.get('SUPABASE_SERVICE_ROLE_KEY','')
        if not base.startswith('https://') or not key: raise SystemExit('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY for the target project.')
        if args.restore_profiles:
            for user in snapshot.get('auth_profiles',[]):
                api(base,key,'/auth/v1/admin/users/'+urllib.parse.quote(str(user['id'])),{'user_metadata':user.get('user_metadata',{}),'app_metadata':{**user.get('app_metadata',{}),'mr4u_login_verification':False}},'PUT')
            print('Updated existing authentication profiles. Missing identities must be recreated and mapped first.')
        for table in order_tables(tables,snapshot.get('schema')):
            rows=tables[table]
            generated={c['column_name'] for c in (snapshot.get('schema') or {}).get('columns',[]) if c.get('table_name')==table and c.get('is_generated')=='ALWAYS'}
            if generated: rows=[{key:value for key,value in row.items() if key not in generated} for row in rows]
            if table in ['mr4u_login_challenges','mr4u_login_proofs','mr4u_receipt_worker_config']: continue
            if table=='mr4u_login_security': rows=[dict(r,enabled=False) for r in rows]
            if table=='mr4u_payment_receipts': rows=[dict(r,state='cancelled',lease_until=None,retry_at=None) for r in rows]
            if not args.restore_schedules and table=='mr4u_backup_preferences': rows=[dict(r,enabled=False,next_run_at=None) for r in rows]
            for start in range(0,len(rows),100):
                api(base,key,'/rest/v1/'+urllib.parse.quote(table),rows[start:start+100],'POST',prefer='resolution=merge-duplicates,return=minimal')
            print('Upserted',table,len(rows))
        for bucket in snapshot.get('storage_buckets',[]):
            bid=bucket['id']
            # Existing buckets are updated; absent ones are created. Both preserve visibility settings.
            try: api(base,key,'/storage/v1/bucket/'+urllib.parse.quote(bid),{'public':bool(bucket.get('public'))},'PUT')
            except urllib.error.HTTPError as error:
                if error.code not in (400,404): raise
                api(base,key,'/storage/v1/bucket',{'id':bid,'name':bucket.get('name',bid),'public':bool(bucket.get('public'))},'POST')
        for item in manifest['files']:
            if not item['path'].startswith('storage/'): continue
            bucket,name=item['path'][8:].split('/',1);data=archive.read(item['path']);route='/storage/v1/object/'+urllib.parse.quote(bucket)+'/'+urllib.parse.quote(name,safe='/')
            # PUT overwrites an existing object; POST creates one that is missing.
            try: api(base,key,route,data,'PUT','application/octet-stream')
            except urllib.error.HTTPError as error:
                if error.code not in (400,404): raise
                api(base,key,route,data,'POST','application/octet-stream')
            print('Restored file',bucket+'/'+name)
        print('Restore finished. Verify the site, document downloads, access restrictions and account mappings before using this project. Received email attachments are preserved under incoming-email/ for manual retrieval; they cannot be re-uploaded into the original email provider mailbox by this tool.')
if __name__=='__main__': main()
