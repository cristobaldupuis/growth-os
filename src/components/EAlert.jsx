export function EAlert({endDate,status,t,dk}) {
  if (!["Running","Draft"].includes(status)||!endDate) return null;
  const days = Math.ceil((new Date(endDate+"T12:00:00")-new Date())/86400000);
  if (days>14) return null;
  const urg = days<=3;
  return <span style={{fontSize:11,fontWeight:600,padding:"2px 8px",borderRadius:4,background:urg?(dk?"#2a1010":"#fdf0f0"):(dk?"#2a2410":"#fdf8ee"),color:urg?"#e07070":"#c09828",border:"1px solid "+(urg?"#6a2828":"#c09828")}}>{days<=0?"End date passed":"Ends in "+days+"d"}</span>;
}
