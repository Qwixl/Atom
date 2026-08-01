# Atom protocol specification work

This directory holds the standards-track material for the Atom protocol: the
IETF Internet-Draft, the A2A extension publication package, and the conformance
test vectors they reference.

## Contents

| Path | What it is |
|---|---|
| `draft-chapman-a2a-mls-00.md` | **Published `-00` snapshot** (matches Datatracker first submission) |
| `draft-chapman-a2a-mls-00.txt` / `.xml` | Rendered `-00` (do not overwrite with later work) |
| `draft-chapman-a2a-mls-01.md` | **Published `-01`** on Datatracker — Option A + GO extension cross-link (do not rewrite as next upload) |
| `draft-chapman-a2a-mls-01.txt` / `.xml` | Rendered `-01` snapshot |
| `draft-chapman-a2a-mls-02.md` | **Current MLS working revision** — Purpose Value Registry (D132 / ST-03); on Datatracker |
| `draft-chapman-a2a-mls-02.txt` / `.xml` | Rendered `-02` |
| `draft-chapman-a2a-offline-delivery-00.md` | **Published `-00`** on Datatracker (D133 / ST-04a) |
| `draft-chapman-a2a-offline-delivery-00.txt` / `.xml` | Rendered `-00` snapshot |
| `build.sh` | Renders and validates a draft: `./build.sh [draft-name]` |
| `extensions/` | **A2A extension specs** — start with [Governed Object v1](./extensions/data-object-v1/) |
| `vectors/` | 31 conformance test vectors — see `vectors/README.md` |
| `second-impl/` | Minimal **Python** second implementation of encapsulation (`070`–`078`) + GO |
| `hostile/` | Adversarial encapsulation mutations (D110 complement to the fixed corpus) |
| `announcements/` | Founder-gated external text (Datatracker / list notes) |

**Provenance is recorded by Datatracker submission**, not by mailing-list email.
MLS `-00` / `-01` / `-02` and offline-delivery `-00` are on Datatracker.
Email to `mls@ietf.org` is optional awareness after a revision is public.

## Why the draft is vendor-neutral

The draft deliberately avoids Atom branding in its normative text. The envelope
is called a "Governed Object", not an "Atom DataObject", and the specification
is written so that an implementation with no connection to Atom can conform to
it.

This is not modesty, it is the mechanism by which attribution works. A
specification that reads as one vendor's product documentation is adopted by
nobody and cited by nobody. A specification that reads as a general solution
gets implemented by other people, and every one of those implementations cites
`draft-chapman-a2a-mls` in its own documentation. Authorship of the document is
permanent and independent of who owns the trademark.

Atom appears in exactly one place: the Implementation Status section, which
names it as the reference implementation. That section is the strongest part of
the document politically, because most drafts in this space have no running
code.

## Building the draft

No local toolchain is required. The IETF's own renderer validates and builds it:

```bash
./build.sh draft-chapman-a2a-mls-02   # current working revision
./build.sh draft-chapman-a2a-mls-01   # published -01 snapshot
./build.sh draft-chapman-a2a-mls-00   # frozen published -00 snapshot
```

This posts the markdown to `author-tools.ietf.org`, reports any errors or
warnings, and writes the rendered `.txt` and `.xml`. It must report zero errors
before submission. Omitting the argument builds the revision named as the default
in `build.sh` (currently `-02`).

To work offline instead:

```bash
uv tool install xml2rfc
gem install kramdown-rfc2629   # requires Ruby
kramdown-rfc2629 draft-chapman-a2a-mls-02.md > draft-chapman-a2a-mls-02.xml
xml2rfc --text draft-chapman-a2a-mls-02.xml
```

## Submitting a revision (Datatracker)

Cost: nothing. There is no fee to publish an Internet-Draft.

1. Ensure you have an IETF Datatracker account at <https://datatracker.ietf.org/accounts/create/>.
2. Run `./build.sh draft-chapman-a2a-mls-02` and confirm zero errors.
3. Upload **only** `draft-chapman-a2a-mls-02.xml` at
   <https://datatracker.ietf.org/submit/>. The source, text, and vectors stay in
   this repository; they are not additional submission files.
4. Confirm via the emailed link. The draft appears at
   `https://datatracker.ietf.org/doc/draft-chapman-a2a-mls/`.

Do **not** overwrite `-00` or `-01` files with later normative edits. Bump the
revision number (`-01`, `-02`, …) for every Datatracker submission.

Two operational notes:

- Drafts expire after six months. Submitting a new revision before expiry keeps the
  document alive; letting it lapse does not erase it, but a lapsed draft reads
  as abandoned.
- Submissions are closed for a period around each IETF meeting. Check
  <https://datatracker.ietf.org/meeting/important-dates/> before relying on a
  specific date.

After a revision is public, you MAY announce it on `mls@ietf.org` with a narrow
technical review ask. That email does not create the draft record.

## Conformance vectors

`vectors/` holds machine-readable inputs and expected outcomes for every
normative MUST in the draft, with a runner that checks this repository against them:

```bash
node spec/vectors/run.mjs
```

Their purpose is threefold:

1. They let a second implementation prove conformance without coordinating with
   us, which is what makes the specification real rather than aspirational.
2. They are executable acceptance criteria for our own implementation. They were
   written from the specification text rather than generated from
   `@qwixl/protocol`, so that they are capable of disagreeing with it — and one
   of them did, catching a live expiry-extension bug.
3. Two interoperating implementations plus test vectors is the evidentiary bar
   for a specification being taken seriously. It is a much lower bar than it
   sounds, and almost nobody in the agent protocol space currently meets it.

Full detail is in `vectors/README.md`. Read it before claiming conformance
anywhere public: two of the thirty-one vectors currently pass only because the
runner implements what the library does not.

## Second implementation (Python)

Encapsulation **and** Governed Object processing — enough to prove the vectors
without TypeScript. See `second-impl/README.md`.
