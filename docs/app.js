const screens = {
  planner: { caption: 'Know where you are, what’s next, and when to make your move.' },
  setup: { caption: 'Your reset, your time zone, your budget. See the trade-offs together.' },
  calendar: { caption: 'See the rhythm of paid time, free-tier gaps, and rest days across the year.' }
};
const tabs = [...document.querySelectorAll('[role="tab"]')];
function selectScreen(tab) {
  const screen = screens[tab.dataset.screen];
  tabs.forEach(item => { const active = item === tab; item.setAttribute('aria-selected', String(active)); item.classList.toggle('active', active); item.tabIndex = active ? 0 : -1; });
  document.querySelectorAll('[data-demo-panel]').forEach(panel => { panel.hidden = panel.dataset.demoPanel !== tab.dataset.screen; });
  document.getElementById('screen-caption').textContent = screen.caption;
  document.getElementById('screen-panel').setAttribute('aria-labelledby', tab.id);
}
tabs.forEach((tab, index) => {
  tab.addEventListener('click', () => selectScreen(tab));
  tab.addEventListener('keydown', event => {
    let next;
    if (event.key === 'ArrowRight') next = (index + 1) % tabs.length;
    if (event.key === 'ArrowLeft') next = (index - 1 + tabs.length) % tabs.length;
    if (event.key === 'Home') next = 0;
    if (event.key === 'End') next = tabs.length - 1;
    if (next !== undefined) { event.preventDefault(); selectScreen(tabs[next]); tabs[next].focus(); }
  });
});
const price = document.getElementById('monthly-price');
const purchases = document.getElementById('purchase-range');
const currency = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 });
function updateSavings() {
  const amount = Number(price.value);
  const count = Number(purchases.value);
  document.getElementById('window-scope').textContent = count === 10
    ? 'Window figures show the 10-purchase example. Exact annual windows require your subscription dates and reset schedule.'
    : 'Spending above now uses ' + count + ' purchases. Window figures remain the 10-purchase example; exact annual windows require a dated plan.';
  const valid = price.value !== '' && Number.isFinite(amount) && amount >= 1 && amount <= 1000000;
  price.setAttribute('aria-invalid', String(!valid));
  document.getElementById('purchase-count').innerHTML = count + ' <span>/ year</span>';
  document.getElementById('annual-spend').textContent = valid ? currency.format(amount * 12) : '—';
  document.getElementById('planned-spend').textContent = valid ? currency.format(amount * count) : '—';
  document.getElementById('savings-total').textContent = valid ? currency.format(amount * (12 - count)) : '—';
  document.getElementById('saving-percent').textContent = valid ? ((12 - count) / 12 * 100).toFixed(1) + '% less' : 'Enter a valid price';
}
price.addEventListener('input', updateSavings);
purchases.addEventListener('input', updateSavings);
updateSavings();

document.querySelector('.window-explainer-link').addEventListener('click', () => {
  document.getElementById('six-window-explanation').open = true;
});
