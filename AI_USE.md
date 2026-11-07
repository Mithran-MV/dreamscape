# How AI was used

ETHGlobal asks every team to say where and how AI tools were used to build their project. This is that note.

## Who built it

Mithran built Dreamscape solo during the event:
- the idea, the product and how it looks and feels;
- the architecture: what runs on 0G, what lives on ENS and what lives on Arkiv, and why;
- the spec, and every decision about what to build, what to cut and what shipped;
- the testing on real wallets, real testnets and an Android phone, the live deployment, the demo and the video.

## The coding assistant

I used an AI coding assistant in my terminal as a pair programmer for parts of the work: scaffolding and boilerplate, help writing and debugging the integration code for the 0G, ENS and Arkiv SDKs, writing the fork tests, reviewing the code for bugs and security issues, and first drafts of the docs, which I edited. I directed each change, tested the results, and decided what to keep.

No other AI tools were used to write code, text or assets for this repository.

Where it helped most:
- scaffolding and boilerplate (`create-next-app`, `forge init` and the Android project Capacitor generates);
- integration code against the 0G, ENS and Arkiv SDKs, worked out from their docs and source;
- the fork tests and local-node tests;
- a security review of the live site, whose fixes are in the commit history;
- first drafts of the README, `SPEC.md` and the partner write-ups in `docs/` and `arkiv/`;
- the logo's SVG, drawn to my brief.

## AI inside the product

The paintings, comics, moving portraits and Morning Notes, and the landing page's pictures, are made by Dreamscape's own pipeline on 0G Private Computer from sample dreams. That is the product, not how it was built.

## Spec

`SPEC.md` is the spec the build follows. I wrote it with the assistant at the start of the event, from my description of the idea, and changed it as the product changed.
