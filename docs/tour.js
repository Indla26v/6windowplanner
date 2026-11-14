const demoUsage = document.getElementById('demo-usage-input');
demoUsage.addEventListener('input', () => {
  const used = Number(demoUsage.value);
  const valid = demoUsage.value !== '' && Number.isFinite(used) && used >= 0 && used <= 100;
  demoUsage.setAttribute('aria-invalid', String(!valid));
  document.getElementById('demo-progress-fill').style.width = (valid ? used : 0) + '%';
  document.querySelector('.demo-progress').setAttribute('aria-valuenow', String(valid ? used : 0));
  document.getElementById('demo-usage-percent').textContent = valid ? used + '%' : '—';
  document.getElementById('demo-usage-status').textContent = !valid
    ? 'Enter a percentage between 0 and 100.'
    : used === 0 ? 'Free tier now. Your next paid window starts Thu, 19 Nov.'
    : 'Example usage reading: ' + (100 - used) + '% remains until the scheduled weekly reset.';
});

const demoMoney = new Intl.NumberFormat('en-IN', {style:'currency', currency:'INR', maximumFractionDigits:0});
const demoUnitMoney = new Intl.NumberFormat('en-IN', {style:'currency', currency:'INR', minimumFractionDigits:2, maximumFractionDigits:2});
const demoPrice = document.getElementById('demo-monthly-price');
demoPrice.addEventListener('input', () => {
  const value = Number(demoPrice.value);
  const valid = demoPrice.value !== '' && Number.isFinite(value) && value >= 1 && value <= 1000000;
  demoPrice.setAttribute('aria-invalid', String(!valid));
  document.getElementById('demo-annual-cash').textContent = valid ? demoMoney.format(value * 12) : '—';
  document.getElementById('demo-planned-cash').textContent = valid ? demoMoney.format(value * 10) : '—';
  document.getElementById('demo-cash-saved').textContent = valid ? demoMoney.format(value * 2) + ' less with 10 purchases instead of 12.' : 'Enter a monthly price between ₹1 and ₹10,00,000.';
  document.getElementById('demo-standard-cost').textContent = valid ? demoUnitMoney.format(value * 12 / 54) : '—';
  document.getElementById('demo-planned-cost').textContent = valid ? demoUnitMoney.format(value * 10 / 53) : '—';
});

const demoReminder = document.getElementById('demo-reminder-toggle');
demoReminder.addEventListener('change', () => {
  document.getElementById('demo-reminder-status').textContent = 'Example reminders ' + (demoReminder.checked ? 'enabled' : 'disabled');
});

document.querySelector('.demo-calendar-export').addEventListener('click', () => {
  const calendarTab = document.getElementById('tab-calendar');
  calendarTab.click();
  calendarTab.focus({preventScroll:true});
  document.getElementById('demo-calendar-title').scrollIntoView({behavior:'smooth',block:'start'});
});

const exampleMonths = [
  {year:2026,month:9,sprint:[8],rest:[],gap:[],rebuy:[],inactive:[1,2,3,4,5,6,7]},
  {year:2026,month:10,sprint:[6,7,19],rest:[8,14,15],gap:[9,10,11,12,13,16,17,18],rebuy:[],inactive:[]},
  {year:2026,month:11,sprint:[18],rest:[19,20],gap:[21,22,23],rebuy:[24],inactive:[]},
  {year:2027,month:0,sprint:[22,23],rest:[24],gap:[25,26,27],rebuy:[28],inactive:[]}
];
const statusNames = {paid:'Paid day',sprint:'Entry / exit sprint',rest:'Weekend rest on the free tier',gap:'Workday on the free tier',rebuy:'Early re-buy: shares an already-used week',inactive:'Before the example subscription'};
const monthFormat = new Intl.DateTimeFormat('en', {month:'long',year:'numeric',timeZone:'UTC'});
const dayFormat = new Intl.DateTimeFormat('en', {weekday:'long',day:'numeric',month:'long',year:'numeric',timeZone:'UTC'});
const monthsContainer = document.getElementById('demo-months');
exampleMonths.forEach(month => {
  const start = new Date(Date.UTC(month.year, month.month, 1));
  const days = new Date(Date.UTC(month.year, month.month + 1, 0)).getUTCDate();
  const offset = (start.getUTCDay() + 6) % 7;
  const section = document.createElement('section');
  section.className = 'demo-month';
  const heading = document.createElement('h4');
  heading.textContent = monthFormat.format(start);
  section.appendChild(heading);
  const weekdays = document.createElement('div');
  weekdays.className = 'demo-weekdays';
  weekdays.setAttribute('aria-hidden','true');
  ['Mo','Tu','We','Th','Fr','Sa','Su'].forEach(day => {const label=document.createElement('span');label.textContent=day;weekdays.appendChild(label);});
  section.appendChild(weekdays);
  const grid = document.createElement('div');
  grid.className = 'demo-day-grid';
  for(let index=0; index<offset; index++){const blank=document.createElement('span');blank.setAttribute('aria-hidden','true');grid.appendChild(blank);}
  for(let day=1; day<=days; day++){
    const date = new Date(Date.UTC(month.year, month.month, day));
    const status = ['inactive','sprint','rest','gap','rebuy'].find(type => month[type].includes(day)) || 'paid';
    const button = document.createElement('button');
    const reset = date.getUTCDay() === 5;
    button.type='button';
    button.className='demo-day '+status+(reset?' reset':'');
    button.textContent=String(day);
    button.setAttribute('aria-label',dayFormat.format(date)+': '+statusNames[status]+(reset?'; weekly reset at 6:30 am IST':''));
    button.setAttribute('aria-pressed','false');
    button.addEventListener('click',()=>{
      monthsContainer.querySelectorAll('[aria-pressed="true"]').forEach(item=>item.setAttribute('aria-pressed','false'));
      button.setAttribute('aria-pressed','true');
      document.getElementById('demo-day-detail').textContent=dayFormat.format(date)+' · '+statusNames[status]+(reset?' · Weekly reset: 6:30 am IST':'')+'.';
    });
    grid.appendChild(button);
  }
  section.appendChild(grid);
  monthsContainer.appendChild(section);
});
