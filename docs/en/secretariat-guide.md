> 🇪🇸 [Español](../es/guia-secretaria.md)

# Secretariat (officials) guide

> 🚧 **Draft.** Describes the **intended** behaviour; the platform is not implemented yet. Screenshots will come with v1 and will use fictitious data.

The **officials** role (1–3 people) creates, opens, closes and annuls votes, and records the electorate, attendance and proxies. Technical administration (starting and stopping the server) may fall to the same people.

## Before the session

1. **Start the server:** on GitHub, in the deployment repository, run the **`up`** workflow and approve it. Wait until the interface shows the API as available.
2. **Electorate:** import or review the CSV (name, e-mail, degrees). Do not include unnecessary data, such as year of study or the reason for an absence.
3. **Proxies:** record those received through the channel stated in the notice. Only "justified: yes" is stored. The platform rejects proxies above the cap and e-mails both people.
4. **E-mail test:** send yourself a code to check that e-mails arrive.
5. **Planned votes:** you can prepare them, but remember that **an open vote cannot be edited**.

## During the session

1. **Open the session.** The total number of members is frozen.
2. **Attendance:**
   - Record in-person and remote arrivals (remote ones when you see the person on the video call).
   - Record departures too.
   - If someone who delegated arrives, mark them present: their proxy is suspended for later votes.
3. **Calls:** if there is no quorum at the first call, the **second call** button is enabled after the minutes set in the profile.
4. **Live votes:**
   - Create the vote: method, options or candidates, secret or not, and degree filter. If someone requests a secret vote, the platform shows how many people are needed.
   - Open it. If quorum is missing, the platform warns you; you can **force** the opening, but the reason will be published.
   - For end-of-session votes, the platform waits until the key fingerprint is published on GitHub Pages before opening. For live votes you can choose to wait (~1 min [to be verified]); it is safer.
   - Close it. The result is published automatically.
5. **Elections to positions:** use the **assistant**, which proposes the next vote (run-off, re-vote, draw or next position). Whoever is elected is withdrawn from later positions; you can undo this by giving a reason.
6. **Draws:** when needed, the platform commits the seed and waits for a drand round about 30 seconds later. Project the commitment.
7. **Assisted access:** if someone cannot read their e-mail, check their identity in person and generate their code.
8. **Mistakes:** if a vote was misconfigured, **annul** it with a reason and create a new one.
9. **Outages:** if the server goes down and returns within 10 minutes, the vote resumes. Otherwise, annul it and repeat it on paper or later.
10. **Paper mode:** if needed, switch the whole vote to paper and enter per-cell totals.

## When the session ends

1. Announce the **deadline** for end-of-session votes before closing the session.
2. Open them. The attendance snapshot is taken when the session ends (per the profile) and they close automatically.
3. When they close, check the public view to make sure the boards were published.

## Afterwards

1. **Minutes:** export the Markdown (rules, nominal attendance, results, draws and forced openings), the CSV and the board JSON.
2. **Verification:** run the verification tool on the published data, or ask someone outside the team to do it.
3. **Shut down:** run the **`down`** workflow once nothing is open (including assent procedures).
4. **Backups:** they are created automatically and encrypted. Two members of the Standing Committee keep the decryption key offline.

## Assent by e-mail

1. Create the proposal. The platform shows the excluded matters: confirm it is not one of them.
2. Choose the deadline. It cannot be earlier than 23:59 (Madrid time) on the second calendar day after sending.
3. It is sent to the whole electorate. You will be notified of each objection. At the deadline, it is approved or goes to the next plenary.

## Handover

The incoming Committee receives the **body's institutional e-mail account**, which every account of the instance is registered with, and the repository link. Changing passwords and tokens and generating a new backup key is recommended (optional but strongly advised). A detailed checklist will be published with v1.
