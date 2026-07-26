export function EAlert({endDate,status,t}) {
  if (!["Running","Draft"].includes(status)||!endDate) return null;
  const days = Math.ceil((new Date(endDate+"T12:00:00")-new Date())/86400000);
  if (days>14) return null;
  const urg = days<=3;
  return <span style={{fontSize:11,fontWeight:600,padding:"2px 8px",borderRadius:4,background:urg?t.redBg:t.warnBg,color:urg?t.red:t.warn,border:"1px solid "+(urg?t.red:t.warnBorder)}}>{days<=0?"End date passed":"Ends in "+days+"d"}</span>;
}
