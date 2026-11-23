# Working together

How the semester runs: when we meet, how pull requests get reviewed, and what
happens when the contract changes.

Read it once at the start.

### When we meet

**Check-in, 30 minutes.** Weekly for the first month while scope is still being
worked out, then every other week once you know what you're building. Your
programme's exact day is set with your team.

**Office hours, 30 minutes, every week, right before the check-in.**
It runs if there's an agenda and is canceled if there isn't. It exists so
that "we're stuck" has somewhere to go that isn't an email at eleven at night.

**A short note before each check-in.** There is a template in
[`CHECK-IN-TEMPLATE.md`](./CHECK-IN-TEMPLATE.md), including a different version
for the first one, when nothing is built yet.

It covers what you built, what you're unsure about, and what you assumed. It also
doubles as the office-hours agenda: if the note has open questions in it we use
the slot, and if it doesn't we skip it.

**We care most about the assumptions in that note.** Writing down "we assumed X" is normal, and it's how we find out a document was unclear before you've built two weeks on top of it. An assumption you write down can turn into a contract change.

**Where distance allows, we meet in person once**, around week three or four, while your team's design is still being settled and a conversation in a room can still change it.

### Pull requests

**Pull requests opened by the stated cutoff get reviewed before that check-in.** Later ones
roll to the next cycle. That's not a penalty. It's so you can predict when feedback arrives instead of
pushing something rushed at 5:55pm.

**Open one pull request per feature, and open it early as a draft.** We would rather see it at 20% and say "not that direction" than read 800 lines and ask you to start again. If a pull request takes more than about fifteen minutes to read, it is probably two.

### Releases at the end of the semester

The three programmes end on different days, so the releases come early, and each week brings the
site (the hosted `apps/web`) closer to one product. Until I merge a layer's release, the site uses
the mocks: stand-ins for the content layer's API and the intelligence layer's API, in
`packages/mock-apis`.

| When | What happens |
| --- | --- |
| Wednesday 2 December | Every layer opens its first release pull request, by the end of the day |
| Wednesday 2 to Friday 4 December | Everyone reads the release pull requests and settles questions on them. The experience layer gets the site working on the mocks |
| Friday 4 December | I merge each release pull request that runs and has no open questions |
| Monday 7 December | The experience layer puts up the first version of the site with what I merged, and sends the content layer a guide to finding its screens on it |
| Wednesday 9 December | Second release pull requests: fixes, and the scorer if it wasn't in the first |
| Friday 11 December | I merge them, and the site picks them up by Monday 14 December |
| Week of 14 December | Close-out: polish and handoff notes, nothing new |

**A release is a pull request upstream with your app as it is on your fork's `main`.** Small is
fine. [`GIT.md`](./GIT.md) ("Sending a release") shows how to send only your own folders. Here's
what each layer sends:
- **Content layer:** `apps/capture-api` and `apps/capture-web`.
- **Intelligence layer:** `apps/graph-api`, with one scorer in it. If your scorer lives somewhere
  else, move it into `apps/graph-api` on your `main` first, because the release copies from there.
- **Experience layer:** `apps/web`, `apps/landing`, `packages/read-model` and `packages/terms`.

**If your layer has an API, put an `ENDPOINTS.md` in its folder** (`apps/capture-api` or
`apps/graph-api`). List each route: the method and path, what it takes, what it returns (the type's
name in `packages/contracts/src/model.ts`, where there is one), and whether it works yet. The
routes in `packages/mock-apis/README.md` are the target. If one of yours differs, list the
difference. The experience layer adapts to it when it integrates, so you don't need to rename
anything.

**The release pull requests are where we work things out together.** Read the other layers'
releases, and ask about anything unclear on the pull request itself, tagging the people who opened
it and me. I review them with you between Wednesday and Friday, and merge each one once it runs and
we've settled its questions. The experience layer can try a release's branch before I merge it.

**For the content layer, the site is a stretch goal.** If your release pull request is open by the
end of Wednesday 2 December, your screens can be on the site for your presentation. If it isn't,
your project still stands on its own, the same as it does now. In the week of 7 December your own
work comes first: polish, your presentation, and answering the experience layer's integration
requests. Your fixes go in the second release.

**For the intelligence layer, the scorer on the site is a stretch goal too.** Send it with the first
release if you can, or with the second on Wednesday 9 December.

**The week of 14 December is close-out.** Nothing new goes on the site. Each team finishes its
handoff note (H1), and the experience layer fixes what's broken until the end of its semester.

**The mocks are the fallback.** Once I merge a layer's release, the site points at that layer's
real API, and keeps the mock so it can switch back if the real API has a problem. The experience
layer makes that switch, on purpose. It's a setting, never automatic, so nobody reading the site
sees invented places as if they were real ones. `packages/mock-apis/README.md` says how.

**A release never changes `packages/contracts` or `packages/fixtures`.** If you need a change there,
send it as its own pull request.

**Your own layer's work comes first.** It's what your course grades you on. Answer quick questions
from another layer within a day, by replying where they tagged you. If a request would take real
work, say so and tag me, and I'll decide whether it's worth doing this semester. Until then, the
team that asked keeps going on the mocks.

For the experience layer, integration is your own work, and the mocks come first. Build each
integration against the mock, so that moving to the real API only changes an address, and ask
another team only where its release behaves differently from the mock.

### When the contract changes

`@sagas/contracts` and `@sagas/fixtures` are sponsor-owned, and they *will*
change during the semester. A change here is how something one team finds, or something learned from somebody in the community, reaches everyone else. Four rules make that safe:

1. **Changes land on Sundays.** The contract cannot move mid-week, and the
   upstream watch reports a change on the Monday morning after it lands. This
   limits when we can publish a change. It does not mean a change comes every
   week, and we expect three to five across a semester.
2. **Nothing lands cold.** A significant change is raised at a check-in *before*
   it is built, then published the following Sunday. You will hear "we might
   change X" before you see X change.
3. **Your fork is pinned to a tag.** A change is *available* to you, never
   imposed. Pulling forward is a decision made together at a check-in, not
   something that happens to you mid-sprint.

   **You hear about changes every week and adopt them when you choose.** Don't pull every Monday, because that puts you back on a moving target. Instead, `.github/workflows/upstream-contract-watch.yml`
   runs each Monday morning, compares your pinned contract version against
   upstream, and opens an issue with the changelog if they differ. Nothing in
   your fork changes; you just find out. **Enable Actions on your fork once
   after forking.** GitHub disables them by default, so open the Actions tab and
   click through the confirmation.
4. **Every change carries a version bump, a CHANGELOG entry, and its reason.**
   The reason matters more than the diff. For example, "dialect can't be recovered from text after the fact, so it has to be captured at contribution time" tells you something the diff never will.

   There is **one** changelog for all three layers, and entries name layers rather than universities, so a change that starts on one layer is visible to the other two. A team can keep a changelog of its own app inside that app's folder, as the experience layer does in `apps/web/CHANGELOG.md`.

**Freeze windows.** The contract does not move after your team's design lock
(around week three, when your team settles what it is building) except to fix something genuinely broken, and it does not
move at all in the last three weeks of a semester. Anything learned during a
freeze goes into the notes and lands the following term. If the contract
changes outside these rules, that is a mistake on our side. Say so.

### What to do when you are blocked or disagree

**If you're blocked, work around it and tell us. Don't wait.** The layers are set up so that no team has to wait on another. [`docs/GIT.md`](./GIT.md) explains how work moves between the three forks and how to keep going when you need something from another team.

**Disagree with the design.** These scopes describe where the work looked like it
should go from where we were standing in August. Many of the problems here are open, and you may see something we have not. If a scope looks wrong, say so.

