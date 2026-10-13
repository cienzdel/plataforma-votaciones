> 🇪🇸 [Español](../es/guia-verificacion.md)

# Verification guide

> 🚧 **Draft.** Describes the **intended** behaviour; the platform is not implemented yet. Screenshots will come with v1 and will use fictitious data.

## 1. Checking your own vote (voters)

1. After closing, open the platform in the browser you voted from. It downloads the public board and checks that:
   - your token is in the participation list;
   - each answer on your ballot appears, with its value, in its cell list.
2. If you voted on another device, load the **receipt** you downloaded.
3. Read the closing e-mail:
   - the **number of credentials issued in your name** must equal the ballots you received;
   - the **record hash** must match the published one.

If something does not match, tell the officials and, if you suspect tampering, use the channel described in [SECURITY.md](../../SECURITY.md).

## 2. Recomputing a result (anyone)

The independent tool `tools/verify` (Python 3.11 or later) is written from the specification, not from the server code. It checks the whole data repository at once:

```bash
# 1. Clone the instance's public data repository
git clone <data-repository-url> data
# 2. Install the tool (from this repository)
pip install ./tools/verify
# 3. Verify the whole chain; optionally with your receipt and the body's profile
python -m pv_verify data/ --receipt my-receipt.json --profile profile.json
```

It ends with `RESULT: all checks passed` if everything matches; otherwise it shows the first failure of each document.

## 3. What the tool checks

| Check | What it detects |
|---|---|
| Every `participation` signature is valid RSA-PSS under the published key | Votes without a credential |
| No repeated tokens | Double voting |
| Every cell list has as many entries as `participation` | Added or removed cells |
| Votes ≤ credentials issued ≤ rights in the snapshot | Credentials fabricated beyond the electorate |
| Totals and result recomputed with the published rules (`rules_hash`) | Altered count or rules |
| drand round (BLS signature) and draw order | Rigged draws |
| Full hash chain | Rewritten past results |

## 4. What it cannot check

- That the server did not correlate in real time. See the [threat model](threat-model.md).
- Paper or show-of-hands votes: it only checks that the result follows correctly from the entered totals.
- Ghost credentials in the name of present members who did not vote. That depends on each person reading their closing e-mail.
