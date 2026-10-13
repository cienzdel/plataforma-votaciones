/**
 * Milestone H8 in the browser: limited vote with a real drand draw, roll-call posts, a paper count,
 * an assent and the minutes, with axe checks. Runs after flow.spec.ts (files run in name order), in the meeting it opened.
 * The draw waits for a real quicknet round, about 30 seconds after closing.
 */
import { AxeBuilder } from "@axe-core/playwright";
import { expect, test, type Browser, type Page } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const WORK = process.env.PV_E2E_DIR!;

function codeFor(email: string): string {
  for (const f of readdirSync(join(WORK, "mail")).sort().reverse()) {
    const m = JSON.parse(readFileSync(join(WORK, "mail", f), "utf8")) as { to: string; text: string };
    const code = m.text.match(/\b\d{8}\b/);
    if (m.to === email && code) return code[0];
  }
  throw new Error("no code for " + email);
}

async function axe(page: Page, where: string) {
  const { violations } = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).analyze();
  expect(violations.map((v) => `${where}: ${v.id} ${v.nodes.map((n) => n.target).join(" ")}`)).toEqual([]);
}

/** Reuses the session saved by flow.spec.ts when there is one. */
async function login(browser: Browser, email: string): Promise<Page> {
  const state = join(WORK, `state-${email}.json`);
  const saved = existsSync(state);
  const page = await (await browser.newContext({ locale: "es-ES", acceptDownloads: true, ...(saved ? { storageState: state } : {}) })).newPage();
  await page.goto("/");
  if (saved) {
    await expect(page.getByRole("button", { name: "Salir" })).toBeVisible();
    return page;
  }
  await page.getByLabel("Correo electrónico").fill(email);
  await page.getByRole("button", { name: "Enviarme un código" }).click();
  await expect(page.getByText("te hemos enviado un código")).toBeVisible();
  await page.getByLabel("Código de 8 cifras").fill(codeFor(email));
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page.getByRole("button", { name: "Salir" })).toBeVisible();
  return page;
}

async function createVoting(mesa: Page, fill: (p: Page) => Promise<void>, title: string) {
  await mesa.getByRole("button", { name: "Votaciones" }).click();
  await mesa.getByLabel("Pregunta o cargo").fill(title);
  await fill(mesa);
  await mesa.getByRole("button", { name: "Crear", exact: true }).click();
  const card = mesa.locator("article", { hasText: title });
  await card.getByRole("button", { name: "Abrir", exact: true }).click();
  await expect(card.getByText("Abierta")).toBeVisible();
  return card;
}

async function review(page: Page, ballot: ReturnType<Page["locator"]>) {
  await ballot.getByRole("button", { name: "Revisar" }).click();
  await page.getByRole("button", { name: "Enviar el voto" }).click();
}

test("limited vote with a real drand draw, roll call, paper, assent and minutes", async ({ browser }) => {
  test.setTimeout(240_000);
  const mesa = await login(browser, "mesa@example.org");
  await mesa.getByRole("link", { name: "Mesa" }).click();

  // Limited vote, secret, with a tie-break draw.
  const lv = await createVoting(
    mesa,
    async (p) => {
      await p.getByLabel("Método").selectOption("limited_vote");
      await p.getByLabel("Candidaturas (una por línea)").fill("Persona Candidata A\nPersona Candidata B\nPersona Candidata C");
    },
    "Vocales",
  );
  await expect(mesa.getByText("La semilla del sorteo está guardada")).toBeVisible();
  await axe(mesa, "voting with draw");

  const uno = await login(browser, "uno@example.org");
  const ballots = uno.locator("form.ballot");
  await expect(ballots).toHaveCount(2, { timeout: 30_000 });
  await ballots.first().getByLabel("Persona Candidata A").check();
  await axe(uno, "limited vote ballot");
  await review(uno, ballots.first());
  await expect(uno.getByText("Voto enviado y recibido.")).toBeVisible();
  await uno.locator("form.ballot").first().getByLabel("Persona Candidata B").check();
  await review(uno, uno.locator("form.ballot").first());
  await expect(uno.getByText("Voto enviado y recibido.")).toHaveCount(2);

  await lv.getByRole("button", { name: "Cerrar", exact: true }).click();
  await expect(lv.getByText("Esperando el sorteo")).toBeVisible();
  await expect(lv.getByText(/ronda drand \d+/)).toBeVisible();
  // Reveal once the real round exists.
  await expect(async () => {
    await lv.getByRole("button", { name: "Revelar la semilla y sortear" }).click();
    await expect(lv.getByText("Cerrada")).toBeVisible({ timeout: 3_000 });
  }).toPass({ timeout: 90_000, intervals: [5_000] });
  await expect(uno.locator("article", { hasText: "Vocales" }).getByText(/Elegida: /)).toBeVisible({ timeout: 30_000 });
  await expect(uno.getByText("Comprobado: tu voto está en el tablón").first()).toBeVisible();

  // Roll-call committee posts: the ballot names who votes; annulled before its draw.
  const posts = await createVoting(
    mesa,
    async (p) => {
      await p.getByLabel("Modalidad").selectOption("roll_call");
      await p.getByLabel("Método").selectOption("posts");
      await p.getByLabel("Vocalías (una por línea)").fill("Comunicación\nDeportes");
      await p.getByLabel(/Candidaturas: /).fill("Persona Candidata A | Comunicación > Deportes\nPersona Candidata B | Comunicación");
    },
    "Vocalías",
  );
  const dos = await login(browser, "dos@example.org");
  const postsCard = dos.locator("article", { hasText: "Vocalías" });
  await expect(postsCard.getByText("Votación nominal")).toBeVisible({ timeout: 30_000 });
  await postsCard.getByRole("group", { name: "Persona Candidata A — Comunicación" }).getByLabel("A favor").check();
  await axe(dos, "posts ballot");
  await review(dos, postsCard.locator("form.ballot"));
  await expect(postsCard.getByText("Voto enviado y recibido.")).toBeVisible();
  await posts.getByLabel("Motivo de la anulación (se publica)").fill("Prueba de anulación");
  await posts.getByRole("button", { name: "Anular" }).click();
  await expect(posts.getByText("Anulada")).toBeVisible();

  // Paper count entered by the officials.
  const paper = await createVoting(
    mesa,
    async (p) => {
      await p.getByLabel("Modalidad").selectOption("paper");
      await p.getByLabel("Método").selectOption("yes_no");
    },
    "Papel",
  );
  for (const [value, n] of [["A favor", "2"], ["En contra", "1"], ["En blanco", "0"], ["Abstención", "0"]] as const) await paper.getByLabel(value, { exact: true }).fill(n);
  await paper.getByLabel("Papeletas").fill("3");
  await paper.getByRole("button", { name: "Guardar los totales" }).click();
  await expect(paper.getByText("Hecho.")).toBeVisible();
  await axe(mesa, "paper totals");
  await paper.getByRole("button", { name: "Cerrar", exact: true }).click();
  await expect(paper.getByText("Aprobada")).toBeVisible();

  // Assent: Persona Uno objects.
  await mesa.getByRole("button", { name: "Asentimientos" }).click();
  await mesa.getByLabel("Pregunta o cargo").fill("Calendario de sesiones");
  await mesa.getByLabel("Texto de la propuesta").fill("Aprobar el calendario de ejemplo.");
  const closes = new Date(Date.now() + 5 * 86400_000);
  await mesa.getByLabel("Cierre").fill(closes.toISOString().slice(0, 16));
  await mesa.getByLabel(/Confirmo que el asunto/).check();
  await axe(mesa, "assent form");
  await mesa.getByRole("button", { name: "Enviar la propuesta" }).click();
  await expect(mesa.getByText("Hecho.")).toBeVisible();
  const assent = uno.locator("article", { hasText: "Calendario de sesiones" });
  await assent.getByRole("button", { name: "Me opongo" }).click({ timeout: 30_000 });
  await expect(assent.getByText("Te has opuesto.")).toBeVisible();
  await axe(uno, "assents");

  // Minutes.
  await mesa.getByRole("button", { name: "Acta" }).click();
  const download = mesa.waitForEvent("download");
  await mesa.getByRole("button", { name: "Descargar el acta (Markdown)" }).click();
  const md = readFileSync(await (await download).path(), "utf8");
  expect(md).toContain("Vocales");
  expect(md).toContain("Persona Tres → Persona Uno");
  await axe(mesa, "minutes");

  // The published data verify with the independent verifier, including the real drand signature.
  const python = join(import.meta.dirname, "../../../tools/verify/.venv", process.platform === "win32" ? "Scripts/python.exe" : "bin/python");
  if (existsSync(python)) {
    const out = execFileSync(python, ["-m", "pv_verify", join(WORK, "data")], { cwd: join(import.meta.dirname, "../../../tools/verify"), encoding: "utf8" });
    expect(out).toContain("RESULT: all checks passed");
  }
});
