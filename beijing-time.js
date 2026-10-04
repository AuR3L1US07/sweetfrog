const zone='Asia/Shanghai';

export function beijingTime(value,style='short'){
  if(value===null||value===undefined||value==='')return '—';
  const normalized=typeof value==='string'&&/^\d{4}-\d\d-\d\d \d\d:\d\d:\d\d$/.test(value)
    ?value.replace(' ','T')+'Z':value;
  const date=new Date(normalized);
  if(Number.isNaN(date.getTime()))return '—';
  const options=style==='full'
    ?{year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}
    :style==='clock'
      ?{hour:'2-digit',minute:'2-digit',hourCycle:'h23'}
      :{month:'numeric',day:'numeric'};
  return new Intl.DateTimeFormat('zh-CN',{...options,timeZone:zone}).format(date);
}
