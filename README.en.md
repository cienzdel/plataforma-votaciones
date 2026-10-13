> 🇪🇸 [Leer en español](README.md)

# plataforma-votaciones

A **public, auditable** web platform for the votes of a student representative body. Secret ballots use **RSA blind signatures** ([RFC 9474](https://www.rfc-editor.org/rfc/rfc9474.html)).

## Which body

The first instance targets the **Plenary of the Student Council of the Faculty of Science, University of Zaragoza** (Spain), with about 40–60 voting members. Rules are not hard-coded: each body configures them in a profile, so other bodies can reuse the tool in their own instance.

> **This is not an official University of Zaragoza service.** The student body itself promotes and operates it.

## Project status

🚧 **Planning.** There is no application code yet. **Do not use it for real votes.**

- Plan, design decisions and threat model: [`PLAN/`](PLAN/PLAN.md) (in Spanish).
- Goal: a first version for the second term of the 2026-27 academic year. Before it is used, the Plenary must approve its use and the applicable regulations must be ratified.
- Nobody has done an independent security review yet. The invitation to review is open (see [SECURITY.md](SECURITY.md)).

## Why your vote is secret (plain language)

Picture a paper vote with a trick:

1. You write your vote on a slip and put it in an **envelope lined with carbon paper**. Only you know what is inside.
2. The officials check who you are and that you have not already asked for another envelope, then **sign the outside**. The carbon copies the signature onto your slip, but they never see what you wrote.
3. You take the signed slip out and drop it in the ballot box **without giving your name**. The signature proves the vote is authorised, but nobody can tell whose envelope it was.

Blind signatures do this with mathematics:

- Your browser generates a random secret number (the *token*) and "wraps" it before sending it.
- The server, which does know who you are, signs it without being able to see it.
- Your browser then "unwraps" it and sends the vote with that signature over a channel that carries no identity.

So that timing or your connection do not give you away:

- Everyone present receives their signature at the same moment, when the vote opens.
- The vote is sent without cookies or a session.
- **Neither the time, the IP address nor the arrival order is stored.**
- Results are published at closing time, in an order that does not reflect the arrival order.

## How you can check it

- **Your vote was counted as cast.** When you vote you get a **receipt**. After closing, the website automatically checks that your vote appears on the **public bulletin board** exactly as you sent it. Do not show your receipt to anyone: it reveals your vote.
- **No fake votes were added in your name.** When each vote closes you receive an e-mail with the number of credentials issued in your name. If it looks wrong, speak up. The public counters must satisfy: votes ≤ credentials issued ≤ voting rights.
- **The result is correct.** Anyone can recompute it with an **independent verification tool**, written in another language from the specification rather than from the server code.
- **History was not rewritten.** Each result is chained to the previous one by a cryptographic digest (*hash*) that is e-mailed to the whole electorate and published in a public repository.

## Honest limits

The platform **cannot** guarantee everything. In particular:

- **Whoever administers the server while voting is open** could, acting in bad faith and modifying the server, try to link people and votes through timing or IP addresses. Nor can anyone prove exactly which code the server runs (the code in your browser, yes).
- **In live votes**, if the officials do not wait for the key fingerprint to be published on an external site, a malicious server could tag votes by giving each person a different key.
- **The receipt lets you prove to someone else how you voted.** That opens the door to vote buying or coercion. Nor can the platform stop someone from voting while another person watches.
- **The person you delegate your vote to knows how they vote on your behalf.**
- **In very small groups or unanimous votes**, the result reveals how everyone voted. That happens with any system.
- **If you lose your credential before voting** (for example, by clearing browser data), you lose that vote.
- **Paper** and show-of-hands votes have no cryptographic verification.
- The cryptographic library has no published formal audit. Nobody has independently reviewed this project yet.

Full details: [threat model](docs/en/threat-model.md).

## Documentation

| Document | Audience |
|---|---|
| [Voting guide](docs/en/voting-guide.md) | Members who vote |
| [Verification guide](docs/en/verification-guide.md) | Anyone who wants to check a result |
| [Secretariat (officials) guide](docs/en/secretariat-guide.md) | Whoever runs the session |
| [Protocol](docs/en/protocol.md) | Technical readers and auditors |
| [Threat model](docs/en/threat-model.md) | Technical readers and auditors |
| [Plan and decisions (ADR, Spanish)](PLAN/PLAN.md) | Whoever develops or audits the design |

## How to verify a result

Once the tool (`tools/verify`) exists, the process will be:

1. Download the public data of the vote (the bulletin board) from the instance's data repository.
2. Run the verification tool on that data.
3. Check that every verification passes and that the result matches the published one.

Detailed steps: [verification guide](docs/en/verification-guide.md).

## Contributing

Read [CONTRIBUTING.md](CONTRIBUTING.md). The [code of conduct](CODE_OF_CONDUCT.en.md) applies.

## Licence

- Code: [EUPL-1.2](LICENSE). Anyone who deploys a modified version must offer its source code to its users.
- Documentation: [CC BY-SA 4.0](docs/LICENSE).

## Security

Found a flaw? **Do not open a public issue.** Use GitHub private reporting (*Security → Report a vulnerability* tab). See [SECURITY.md](SECURITY.md).
