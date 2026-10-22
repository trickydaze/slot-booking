# 1:1 slot booking (Netlify)

A one-page site where each visitor picks one of 14 slots on Thursday 17 December 2026
(09:00 to 13:35, 15-minute slots with 5-minute breaks), then enters their group number,
first name, last name and email. A booked slot is locked for everyone else. When the 14th
slot is booked, the full list is emailed to 540144@umons.ac.be.

```
public/index.html          booking page
public/admin.html          your page to see bookings, free a slot, resend the email
netlify/lib/schedule.mjs   date, times, rules, email text
netlify/functions/         slots.mjs, book.mjs, admin.mjs (server code)
```

Bookings are stored in Netlify Blobs (built into Netlify, nothing to set up). The email is
sent through Resend (free plan is enough).

## 1. Create the Resend account (5 minutes)

1. Sign up at https://resend.com **using 540144@umons.ac.be** and confirm it.
   Without your own domain, Resend's test sender (`onboarding@resend.dev`) can only deliver
   to the address the account was registered with, which is exactly the address you need.
2. Go to **API Keys**, create a key with **Sending access**, and copy it (it starts with `re_`).
   Resend shows it only once.

## 2. Put the site on Netlify

Drag-and-drop deploys do not run server functions, so use one of these two ways.

**Option A: GitHub (easiest to update later)**
1. Create a new GitHub repository and upload the contents of this folder.
2. In Netlify: **Add new project → Import an existing project → GitHub**, pick the repository.
3. Leave the build settings as Netlify fills them in (they come from `netlify.toml`) and deploy.

**Option B: Netlify CLI (no GitHub needed)**
```bash
cd slot-booking
npm install
npx netlify-cli login
npx netlify-cli deploy --prod     # choose "Create & configure a new project" when asked
```

## 3. Add the environment variables

In Netlify: **Project configuration → Environment variables → Add a variable**.

| Name | Value |
|---|---|
| `RESEND_API_KEY` | the `re_...` key from step 1 |
| `ADMIN_KEY` | a long password of your choice, used on the admin page |
| `NOTIFY_EMAIL` | optional, defaults to `540144@umons.ac.be` |
| `MAIL_FROM` | optional, defaults to `Slot booking <onboarding@resend.dev>` |

Then **redeploy** (Deploys → Trigger deploy → Deploy project, or run the CLI deploy again),
because functions only pick up new variables on the next deploy.

## 4. Test before sharing the link

1. Open the site and book a slot with your own details.
2. Open `https://<your-site>.netlify.app/admin.html`, enter your `ADMIN_KEY`, and check the booking is listed.
3. Click **Email the list now** and confirm the email arrives at 540144@umons.ac.be.
   Check spam or quarantine the first time, and mark it as safe.
4. Click **Clear all bookings**, then share the link with the students.

You can rename the site address under **Domain management** in Netlify.

## Day-to-day

- **A student booked the wrong slot:** admin page → **Free slot** on that row. They can then rebook.
- **The full-list email didn't arrive:** admin page → **Email the list now**. You can also use this
  at any time to get the current list. If the day fills up again after you free a slot, the
  email is sent again automatically.
- **After 17 December:** clear the bookings so the students' names and emails aren't kept.

## Changing settings

- Date, start time, slot length, break, number of slots: `EVENT` in `netlify/lib/schedule.mjs`.
  The page reads these automatically.
- One booking per email is enforced. To also allow only one slot per group, set
  `onePerGroup: true` in `RULES` in the same file.
- The "To change or cancel a booking, email ..." line at the bottom of the page:
  `contactEmail` in the `CONFIG` block near the end of `public/index.html` (set it to `""` to hide it).

Students don't receive a confirmation email (Resend's test sender can only mail you). The
confirmation screen tells them so and offers an **Add to calendar** button instead.
