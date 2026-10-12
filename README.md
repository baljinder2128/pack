# SBT Trucking

Android and iOS app for drivers and office staff:

- **Trip log**: entered by hand, started and finished in the app (records GPS at start and finish).
- **Driver hours**: shifts with breaks, weekly totals, overnight shifts handled.
- **Pre-trip inspection**: daily checklist with photos. Submitting emails it straight to the office.
- **Live tracking**: drivers agree once, then their location is shared while they are **on duty** only.
  Office sees everyone on a map, can open Google Maps, and can send a customer the driver's location.
- **Weekly RCTI**: Monday to Sunday, built from completed trips (trip pay) and hours (hourly rate),
  with GST, exported as a PDF to share or email.
- **Logins**: office creates driver and office logins and removes people when they leave
  (their history stays for past RCTIs).

Built with Expo (React Native) and Supabase (database, logins, photo storage, email function).

## One-time setup

1. **Create a Supabase project** at supabase.com (free tier is fine).
2. **Create the database**: open SQL Editor and run each file in `supabase/migrations/` in order (`0001_init.sql`, then `0002_driver_details.sql`).
3. **Turn off public sign-ups**: Authentication → Sign In / Providers → disable "Allow new users to sign up".
   Only the office creates logins.
4. **Create the first office login**: Authentication → Users → Add user (tick auto-confirm), then in SQL Editor:
   ```sql
   update profiles set role = 'office', full_name = 'Your Name' where email = 'you@example.com';
   ```
5. **Email for inspections**: sign up at resend.com, verify your sending domain, create an API key, then:
   ```sh
   npx supabase login
   npx supabase link --project-ref <your-project-ref>
   npx supabase secrets set RESEND_API_KEY=re_xxx INSPECTION_EMAIL=sbtruckin@outlook.com \
     EMAIL_FROM="SBT Trucking <inspections@your-domain.com>"
   npx supabase functions deploy send-inspection
   npx supabase functions deploy manage-driver
   ```
6. **Point the app at Supabase**: `.env` holds the project URL and publishable (anon) key. To use a different project, override them in `.env.local`
   (Project Settings → API).
7. Sign in as the office user, then fill in **More → Company details** (name, ABN, address for the RCTI).

## Windows (or any computer)

The office can use the app in a web browser at **https://baljinder2128.github.io/pack/**.
It is rebuilt automatically on every push. In Edge or Chrome, use the "Install app" icon in the
address bar to add it to the Start menu like a normal Windows app. Driver tracking and the
on-duty switch only work in the phone app.

## Running and installing

```sh
npm install
npx expo run:android   # or run:ios on a Mac; background tracking needs a real build, not Expo Go
```

Every push also builds the Android app and publishes it at
**https://baljinder2128.github.io/pack/download/sbt-trucking.apk** (open on an Android phone to install).

Or build with EAS:

```sh
npx eas-cli@latest build --profile preview --platform android   # APK link to send to drivers
npx eas-cli@latest build --profile preview --platform ios       # needs an Apple developer account
```

Store release: `npx eas-cli@latest build --profile production` then `npx eas-cli@latest submit`.
Google Play and Apple both ask why the app uses background location; the answer is
"to share the driver's location with dispatch while they are on duty, after the driver agrees in the app".

## How pay works on the RCTI

- Each **completed** trip with a pay amount becomes one line (office sets trip pay).
- Each shift becomes a line at the driver's **hourly rate** (set on the driver's page; leave 0 if paid per trip only).
- GST at 10% is added if the driver is GST registered.
- Issuing gives the RCTI a number. Re-issuing the same week keeps the number and updates the totals.

## Checks

```sh
npm run typecheck   # TypeScript
npm test            # pay, week and shift maths
npm run test:db     # database rules (who can see and change what)
```
