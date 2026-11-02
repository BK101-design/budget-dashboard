# 50/30/20 Wealth Dashboard

A budgeting dashboard for the 50/30/20 rule, plus live investment tracking from Trading 212.

- **Budget**: enter your monthly take-home pay and outgoings, and tag each as Needs, Wants or Savings. The dashboard compares what you actually spend with the 50/30/20 targets.
- **Trading 212 (live)**: positions, prices, returns and account value refresh every 5 seconds, which is the fastest the Trading 212 API allows. The value chart fills in while the page is open.
- **Other holdings**: add tickers from other brokers or crypto (e.g. `TSLA`, `VUSA.L`, `BTC-USD`). Prices come from Yahoo Finance and update every 15 seconds.

Your budget and holdings are saved in your browser. Your API key stays on your computer and is never sent to the browser.

## Run

Needs Node 18 or newer. There are no packages to install.

```bash
cd budget-dashboard
node server.js
```

Then open http://localhost:3212. With no API key set, it runs in **demo mode** with simulated prices.

## Connect Trading 212

1. In the Trading 212 app (web or mobile): **Settings → API (Beta) → Generate API key**.
2. Give the key **read-only** permissions only: *Account data*, *Portfolio*, *Metadata*. Leave order placement switched off.
3. Copy `.env.example` to `.env` and paste in your key (and secret, if you were given one).
4. Set `T212_ENV=demo` if the key belongs to a Practice account.
5. Restart `node server.js`.

API access is available on Invest and Stocks ISA accounts.
