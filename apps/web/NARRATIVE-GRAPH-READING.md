# How a narrative page reads the claim graph

**N5 design note — draft for sponsor review**

The passage is the readable account of a place. The graph is how a reader
checks what supports that account, follows additions, and sees where people
disagree. Moving from passage to graph should preserve the reader's place: open
claims beside the selected phrase, keep the phrase available, and provide a
clear way back.

## Which claims appear first

When several claims support a phrase, show them in the order supplied by the
read model's weight. Use position in the list as the only cue: no score, rank
number, badge, winner label, or stronger visual treatment. The order is a way
into the material, not a statement that the first claim is true or that the
others can be ignored. Keep attribution and source records equally reachable
for every claim.

Weight and how it is calculated remain the intelligence layer's work. Whether
readers, especially contributors, should be told why claims are ordered this
way is open; see ["Should a contributor see why their claim ranks where it
does?" in DESIGN-QUESTIONS.md](../../docs/DESIGN-QUESTIONS.md#should-a-contributor-see-why-their-claim-ranks-where-it-does).

## How additions read

An extension belongs directly under the claim it extends, connected by a
visible indent or line. Keep the parent in view so the reader can tell what the
new words add to. Repeat this nesting for a longer chain. Each step keeps its
own author, source, and time; a chain must not turn into one unattributed
paragraph or imply that later additions replace earlier ones.

How relevance and support should change across a long chain is not settled.
The page should show the links that exist without implying that every step is
equally relevant. See ["How do you tell whether a reply is about what it
targets?" in DESIGN-QUESTIONS.md](../../docs/DESIGN-QUESTIONS.md#how-do-you-tell-whether-a-reply-is-about-what-it-targets).

## How disagreement reads

Put a disagreement beside the detail it addresses. Mark the exact words in the
original claim, then show the disputing claim's replacement words and reasoning
alongside them. Keep other details in the original claim intact. For a dispute
of a whole claim, show it alongside the whole claim instead. Give both readings
equal visual weight, preserve who said each and which record each came from,
and do not label either a winner or show a tally.

The page should make disagreement about a reading, not look like a judgment of
the contributor. Whether that distinction feels right to people whose stories
are disputed remains open; see ["Does disputing a claim feel like disputing the
person who wrote it?" and "What should a disagreement look like to the people
in it?" in DESIGN-QUESTIONS.md](../../docs/DESIGN-QUESTIONS.md#does-disputing-a-claim-feel-like-disputing-the-person-who-wrote-it).

## How records and profiles read

Every claim should lead to its source record and identify the profile that
contributed it. Evidence records should be labeled as evidence, separate from
the source record. A record's collection, when present, stays attached wherever
the record appears, with a path to the other records in that collection. A
profile identifies an action in the archive; it is not proof of a person's
identity or expertise. Keep invented fixture contributors marked as invented.

The shape and description of collections are still limited to the shared
contract; see ["What does a collection carry?" in DESIGN-QUESTIONS.md](../../docs/DESIGN-QUESTIONS.md#what-does-a-collection-carry). Questions about proving or linking profile identity remain open; see ["A profile has no way to say whether anyone can prove it is theirs" in DESIGN-QUESTIONS.md](../../docs/DESIGN-QUESTIONS.md#a-profile-has-no-way-to-say-whether-anyone-can-prove-it-is-theirs).

## How mentions inside claims work

Keep a claim's words intact. A typed reference can give a date, place, person,
or record mention a keyboard-accessible link or an explanation, but only when
the contract supplies a destination. A confirmed place or record reference
with an id can lead to that item. A date can lead to the related details and
claims when the page has that context. A suggested reference should be
visibly tentative and must not behave like a confirmed fact. A person mention
is about the person named in the claim, not a contributor profile; the current
contract gives person references no id to follow. Do not silently normalize a
date or turn a mention into a new entity.

How references are added, confirmed, and used to decide whether a reply
addresses its target remains open. See ["How do you tell whether a reply is
about what it targets?" in DESIGN-QUESTIONS.md](../../docs/DESIGN-QUESTIONS.md#how-do-you-tell-whether-a-reply-is-about-what-it-targets), ["What does an interface do with ‘sometime in the fifties, probably’?" in DESIGN-QUESTIONS.md](../../docs/DESIGN-QUESTIONS.md#what-does-an-interface-do-with-sometime-in-the-fifties-probably), and ["A person named in a claim versus a person with a profile" in DESIGN-QUESTIONS.md](../../docs/DESIGN-QUESTIONS.md#a-person-named-in-a-claim-versus-a-person-with-a-profile).

## Shared-model impact

This proposal uses the existing claim targets, details, references, source and
evidence records, collections, and contributor profiles. It proposes no shared
contract change. If implementation later needs a destination the contract
cannot express, raise that as a question before changing the shared model.

**Review status:** sponsor review and any resulting questions-issue follow-up
are still needed before N5 is complete.
