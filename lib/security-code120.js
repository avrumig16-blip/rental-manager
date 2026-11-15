'use strict';
const design=require('./email-design');
const kinds={
 login:{title:'Verify your login',label:'security code',minutes:10,instruction:'Enter this one-time code on the ManageRent4U login screen.'},
 reset:{title:'Reset your password',label:'password reset code',minutes:15,instruction:'Enter this one-time code on the ManageRent4U password reset screen.'},
 invite:{title:'Set up your password',label:'password setup code',minutes:15,instruction:'Enter this one-time code on the ManageRent4U password setup screen.'},
 tenant:{title:'Verify your tenant portal access',label:'tenant portal verification code',minutes:10,instruction:'Enter this one-time code on the ManageRent4U tenant portal screen.'}
};
function build(kind,code,action){
 const spec=kinds[kind];
 if(!spec||typeof code!=='string'||!/^\d{6}$/.test(code))throw Error('Invalid security email');
 const subject='Your ManageRent4U '+spec.label+': '+code;
 const footer='If you did not request this code, you can ignore this email. Never share your code.';
 let button='',actionText='';
 if(action){const url=new URL(action.url);if(url.protocol!=='https:')throw Error('Security email links require HTTPS');button=design.button(action.label,url.href);actionText='\n\n'+action.label+': '+url.href;}
 // Keep the OTP as one text node. No spaces, split digit cells, images or JS:
 // recipients can select it, and mail clients can recognize the full code.
 const body='<p>'+spec.instruction+'</p><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:22px 0;background:#eff7f3;border:1px solid #d8e8df;border-radius:12px"><tr><td style="padding:22px 18px;text-align:center"><p style="margin:0 0 12px;font:600 13px Arial;color:#416052">Your one-time code</p><div dir="ltr" style="font:700 36px/1.4 Consolas,monospace;letter-spacing:5px;color:#075b43;white-space:nowrap;user-select:all">'+code+'</div><p style="margin:12px 0 0;font:13px/1.5 Arial;color:#416052">Expires in '+spec.minutes+' minutes</p></td></tr></table><p style="font-size:14px;color:#657080">Copy the six-digit code above and paste it into the verification screen. Use only the latest code.</p>'+button;
 return {subject,html:design.frame({title:spec.title,body,footer}),text:'Your ManageRent4U '+spec.label+': '+code+'\n\n'+spec.instruction+'\n\nExpires in '+spec.minutes+' minutes. Use only the latest code.\n\n'+footer+actionText};
}
module.exports={build};
