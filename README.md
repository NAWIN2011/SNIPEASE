# SnipEase — Haircut Booking System

A working booking platform with a customer site, barber portal, and an admin panel that can actually add/edit/remove services and barbers — changes are saved to disk and show up immediately for customers.

## What's real here

- **Customers** book a real appointment: pick style → barber → service → date/time → confirm. It's saved on the server.
- **Barbers** see their own queue (pick their name from the dropdown in "Barber portal"), start/complete jobs — status updates persist.
- **Admin** can add or delete services and barbers from the dashboard — these changes are saved to `data.json` and instantly available to customers on the Book tab. Admin also sees live revenue, booking counts, and a chart.
- Data is stored in `data.json` (a simple file-based database) — no external database server needed, so it runs anywhere Node.js runs. This is enough for a college demo; swapping it for MySQL later is a backend-only change (the frontend won't need to change).

## How to run it

You need [Node.js](https://nodejs.org) installed (any recent version works).

1. Open a terminal in this folder
2. Install dependencies (one-time):
   ```
   npm install
   ```
3. Start the server:
   ```
   npm start
   ```
4. Open your browser to:
   ```
   http://localhost:3000
   ```

That's it — the whole site (customer booking, barber portal, admin panel) runs from that one link while the server is running.

## For your demo / viva

- Book an appointment as a customer, then switch to "Barber portal" and pick the same barber — you'll see it appear.
- Mark it "Start" then "Mark done" — go to "Admin" and see it reflected in the appointments list and revenue.
- In Admin, add a new service (e.g. "Beard Trim") — switch to Book tab, it's there immediately. This is the part that shows real backend logic, not just a mockup.
- To reset all data back to the starting demo state, stop the server and replace `data.json` with the version from this submission (or delete your test bookings via the admin appointments list).

## Making this a live, shareable website (optional next step)

Right now this runs on your own computer (`localhost`). To get it a real link you can send to anyone:
- Free options: [Render](https://render.com), [Railway](https://railway.app), or [Glitch](https://glitch.com) can host a small Node.js app like this for free and give you a public URL.
- Push this folder to a GitHub repo, connect it to one of those services, and it'll build and host it automatically.
- If your project is only being evaluated internally (not shared publicly), running it locally during your demo is enough — you don't need to host it.

## Project structure

```
snipease/
├── server.js       Express backend — all API routes (services, barbers, appointments, stats)
├── data.json        The "database" — plain JSON file, edited by the server on every change
├── package.json
└── public/
    ├── index.html   Page structure
    ├── styles.css    Design system
    └── app.js        Frontend logic — talks to the backend via fetch()
```

## Next steps if you want to go further (for extra marks)

- Swap `data.json` for a real MySQL database (same API routes, just change the read/write functions in `server.js`)
- Add login so "My bookings" only shows a specific logged-in customer's appointments, not everyone's
- Add SMS/WhatsApp reminders using Twilio's free sandbox
