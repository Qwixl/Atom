# Atom protocol specification work

This directory holds the standards-track material for the Atom protocol: the
IETF Internet-Draft, and the conformance test vectors it references.

## Contents

| Path | What it is |
|---|---|
| `draft-chapman-a2a-mls-00.md` | **Current first-submission source**, kramdown-rfc markdown |
| `draft-chapman-a2a-mls-00.txt` | Rendered human-readable draft |
| `draft-chapman-a2a-mls-00.xml` | Rendered XML — upload this one file to Datatracker |
| `build.sh` | Renders and validates the draft: `./build.sh` |
| `vectors/` | 31 conformance test vectors — see `vectors/README.md` |
| `second-impl/` | Minimal **Python** second implementation of encapsulation (`070`–`078`) |
| `hostile/` | Adversarial encapsulation mutations (D110 complement to the fixed corpus) |

An Internet-Draft's first public submission must be numbered `-00`. The current file
contains the complete A2A v1.0 binding, including media-type placement, Agent Card
signatures, version compatibility, and the Governed Object processing rules. There is no
published earlier revision.

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
./build.sh
```

This posts the markdown to `author-tools.ietf.org`, reports any errors or
warnings, and writes the rendered `.txt` and `.xml`. It must report zero errors
before submission. Omitting the argument builds the revision named as the default
in `build.sh`.

To work offline instead:

```bash
uv tool install xml2rfc
gem install kramdown-rfc2629   # requires Ruby
kramdown-rfc2629 draft-chapman-a2a-mls-00.md > draft-chapman-a2a-mls-00.xml
xml2rfc --text draft-chapman-a2a-mls-00.xml
```

## Submitting

Cost: nothing. There is no fee to publish an Internet-Draft.

1. Create an IETF Datatracker account at <https://datatracker.ietf.org/accounts/create/>.
   Free, needs an email address only. No membership or organisation required.
2. Run `./build.sh` and confirm zero errors.
3. Upload **only** `draft-chapman-a2a-mls-00.xml` at
   <https://datatracker.ietf.org/submit/>. The source, text, and vectors stay in
   this repository; they are not additional submission files.
4. Confirm via the emailed link. The draft appears publicly within minutes at
   `https://datatracker.ietf.org/doc/draft-chapman-a2a-mls/`.

Two operational notes:

- Drafts expire after six months. Submitting a new revision (`-01`, then `-02`, and
  so on) before expiry keeps the
  document alive; letting it lapse does not erase it, but a lapsed draft reads
  as abandoned.
- Submissions are closed for a period around each IETF meeting. Check
  <https://datatracker.ietf.org/meeting/important-dates/> before relying on a
  specific date.

Announce a revision on the `mls@ietf.org` mailing list once it is public. That is a
short, plain message describing what the draft addresses and asking for review
of the credential-binding construction specifically — a narrow, answerable
technical question gets replies, a general request for feedback does not.

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

Encapsulation only — enough to prove the wire docs are implementable without
TypeScript:

```bash
python3 spec/second-impl/run_vectors.py
```

See `second-impl/README.md`. Hostile mutations (must all reject):

```bash
python3 spec/hostile/run_hostile.py
```

