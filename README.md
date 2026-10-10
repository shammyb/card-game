# Huntarish card game

Next.js/React frontend with a separate Express, Socket.IO and PostgreSQL/Prisma server.

## Run locally

Use Node 22 (the repository includes an `.nvmrc`). If you use nvm, run `nvm use` from the repository root.

1. Install frontend dependencies with `npm install`.
2. In `huntarish-server`, run `npm install`.
3. Set `DATABASE_URL` in `huntarish-server/.env` to your PostgreSQL connection string.
4. In `huntarish-server`, run `npm run db:generate` and `npm run db:migrate`.
5. Start the backend from `huntarish-server` with `npm run dev` (automatically restarts when server code changes). `npm start` does not reload code.
6. In another terminal, start the frontend from the repository root with `npm run dev`.
7. Open http://localhost:3000.

The frontend defaults to http://localhost:3001 for its backend. Override it with `NEXT_PUBLIC_APIURL` in the root `.env.local`, then restart/rebuild Next.js. Set `FRONTEND_ORIGIN` in the server environment if the frontend is not served from http://localhost:3000. The value must match the browser origin exactly. Use localhost consistently, rather than mixing localhost and 127.0.0.1.

## Accounts and challenges

- Create an account with a display name, email and password of 12–128 characters, or sign into an existing account.
- Accounts and hashed passwords are stored in PostgreSQL. Sessions last seven days and use an HttpOnly cookie; signing out revokes the current session.
- One game connection per account is supported. Use another browser or a private window to test a second account.
- Online players appear in the lobby. Choose **Challenge**; the other player can **Accept** or **Decline**. The sender can cancel. Invitations expire after two minutes and are cleared when either participant disconnects or enters a room.
- Acceptance creates a private two-player room, deals 11 cards privately to each player, and reveals one stack card. Only the invited player can accept.
- Room-code joining remains available to signed-in players. The server uses the account identity, not a submitted display name.
- A connection loss, refresh, or server restart restores a started match from its saved state. **Leave room** closes the room for both players.

Accounts, match state, moves and round scores persist in PostgreSQL. Each validated move and its state change are saved together before clients are updated. Hands remain private; clients receive only their own hand and the opponent’s card count. Server restarts clear pending invitations and waiting rooms but preserve started matches. Fully disconnected rooms are removed from memory after 30 minutes and restored from storage on reconnect. Old room codes cannot be reused. Email verification, password recovery and optional joker modes are not implemented.

## Playing Huntarish

Each round uses one standard 52-card deck without jokers. Deal 11 cards to each player and one card to the stack. The first player in the room starts round one; the starting player alternates each round.

1. **Draw:** take one deck card, or select one or more stack cards and at least one card already in your hand. The oldest selected stack card starts the pickup. The selected stack cards and hand cards must immediately form one valid set/run or extend a table group. All newer unselected stack cards go into your hand; older cards stay in the stack. For example, select three twos from the stack and your hand’s two to play all four together. Stack cards cannot replace the required contribution from your original hand.
2. **Play:** select cards in your hand, then choose a new group or an existing table group. A set is three or four of the same rank. A run is three or more consecutive cards of the same suit. Aces can be low (A–2–3) or high (Q–K–A), never wrapping through K–A–2. Play as many legal groups/extensions as you like after drawing. Either player can extend either player’s table groups; each card retains the identity of whoever played it.
3. **Discard:** select one hand card and choose **Discard & end turn**. This passes the turn. If playing all your cards empties your hand, the round ends immediately without a discard. Discarding your last card also ends the round.

At the start of a turn with an empty deck, a player may choose a legal stack pickup or **End round and score**, even if a legal pickup is possible. Drawing the last deck card still allows that player to complete their turn.

**Scoring:** aces are 15 points; J/Q/K are 10; numbered cards are face value (including 10 = 10). At round end, each player adds the value of all table cards they personally placed and subtracts the value of their remaining hand. Unplayed deck/stack cards do not score. Round scores accumulate and can be negative. At 501 or above, the player with the higher total wins. Equal qualifying totals require another round. Both players press **Ready for the next round** to continue; totals carry forward.

The table includes selectable cards, draw/discard controls, per-card ownership labels, current turn, round results, previous round scores and an in-game rules reference. Moves are validated on the server and carry a revision number to prevent repeated or stale actions.

For deployment, use HTTPS and `NODE_ENV=production` to enable Secure cookies. Serve frontend and backend on the same site (for example through a reverse proxy); the session cookie uses SameSite=Lax. Set the exact allowed frontend origin. Multi-instance live game hosting requires shared game state and presence before it is supported.

### Computer practice

The web and native lobbies offer Beginner (very easy), Easy, Medium, Hard and Expert. All moves use the existing server rules, scoring and 501-point match target. Stronger levels examine deeper stack pickups, preserve useful cards and consider follow-up melds. Difficulty is heuristic, not a guarantee of winning strength; even Expert sees only its own hand and public table cards, never the opponent's hand or hidden deck.

Practice uses private in-memory rooms, makes no database game/round/move records, and never changes multiplayer statistics. The computer pauses while its human is offline and resumes on reconnect. Progress expires after 30 minutes offline, a server restart, or leaving the table. Pressing ready automatically readies the computer for the next round. Native users need APK version 0.2.0 or later for these controls.

Run `npm run test:computer` in `huntarish-server` for deterministic rule simulations and socket integration checks (no live database required).

### Android download

Android visitors see a dismissible direct-APK download banner. Its verified Expo artifact URL and displayed version live in `src/app/components/AndroidDownload.tsx`. For future releases, replace the URL and version together and change the dismissal key so previous visitors can see the update. The APK is a preview distributed outside Google Play; updates are manual. The browser game remains available without installing anything.

## Verification

- Frontend production build: `npm run build` from the root.
- Database schema/client: `npm run db:generate` from `huntarish-server`.
- Rules checks without a database: `npm run test:rules` from `huntarish-server`.
- All checks: `npm test` from `huntarish-server`, after migrations. Both frontend and backend dependencies must be installed. The integration test only runs against a localhost database. It creates uniquely named temporary accounts and games; checks accounts/challenges, private hands, enforced turns, rejected stale/forged moves, a full round, persisted scores, next-round readiness and server restart recovery; then removes those test records.

The production build downloads the existing Geist fonts from Google Fonts and therefore needs network access.
### Player statistics

Signed-in players can view **Your record**, overall or against any past opponent, even when that opponent is offline. Stats are derived from saved results, so existing history counts without a migration. Wins/losses, highest final score, and biggest winning margin (your final total minus the opponent’s) count completed matches only. Best round uses net round points, including completed rounds in ongoing or abandoned matches. Missing records display a dash, not zero. Stats refresh after round changes, reconnecting, or pressing **Refresh stats**. Old games without saved results cannot contribute records. Each account can only request its own statistics.
### Profiles and forfeits

Open **My profile** (`/profile`) to view overall/head-to-head statistics and edit your display name. Names are trimmed and case-insensitively unique for registration and editing. The database enforces this with a functional unique index in migration `20261007220000_unique_names`; existing duplicate names must be resolved before deploying that migration. Renaming never resets account statistics.

Confirming **Leave table** during an unfinished match forfeits it: the opponent wins regardless of the current lead. The current round is scored normally (table points minus hand points), and all match/round records count toward statistics. Leaving between rounds does not score twice, and leaving an already finished match does not alter its winner. A winning margin can be negative when an opponent forfeits while ahead. Disconnections, visiting the profile page, and signing out remain recoverable rather than automatic forfeits; use **Leave table** to concede. Previously abandoned matches are not retroactively assigned a winner.
