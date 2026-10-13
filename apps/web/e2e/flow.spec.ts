/**
 * Full flow of PLAN/PLAN.md §10: the officials and three fictitious voters, one holding a proxy;
 * WCAG 2.2 AA checks with axe on every screen.
 */
import { AxeBuilder } from "@axe-core/playwright";
import { expect, test, type Browser, type Page } from "@playwright/test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const MAIL = join(process.env.PV_E2E_DIR!, "mail");
const CENSUS = ["name,email,degrees", "Persona Mesa,mesa@example.org,bio", "Persona Uno,uno@example.org,bio", "Persona Dos,dos@example.org,phys", "Persona Tres,tres@example.org,bio"].join("\n");

/** The newest login code sent to `email`. */
function codeFor(email: string): string {
  const files = readdirSync(MAIL).sort().reverse();
  for (const f of files) {
    const m = JSON.parse(readFileSync(join(MAIL, f), "utf8")) as { to: string; text: string };
    const code = m.text.match(/\b\d{8}\b/);
    if (m.to === email && code) return code[0];
  }
  throw new Error("no code for " + email);
}

async function axe(page: Page, where: string) {
  const { violations } = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).analyze();
  expect(violations.map((v) => `${where}: ${v.id} ${v.nodes.map((n) => n.target).join(" ")}`)).toEqual([]);
}

async function login(browser: Browser, email: string): Promise<Page> {
  const page = await (await browser.newContext({ locale: "es-ES" })).newPage();
  await page.goto("/");
  await page.getByLabel("Correo electrónico").fill(email);
  await page.getByRole("button", { name: "Enviarme un código" }).click();
  await expect(page.getByText("te hemos enviado un código")).toBeVisible();
  await page.getByLabel("Código de 8 cifras").fill(codeFor(email));
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page.getByRole("button", { name: "Salir" })).toBeVisible();
  return page;
}

async function vote(page: Page, ballot: string, option: string) {
  const form = page.locator("form.ballot", { has: page.getByText(ballot) });
  await form.getByLabel(option, { exact: true }).check();
  await form.getByRole("button", { name: "Revisar" }).click();
  await page.getByRole("button", { name: "Enviar el voto" }).click();
  await expect(page.getByText("Voto enviado y recibido.").first()).toBeVisible();
}

test("officials, three voters and a proxy vote, accessible in Spanish and English", async ({ browser }) => {
  // Login screen in both languages.
  const first = await (await browser.newContext({ locale: "es-ES" })).newPage();
  await first.goto("/");
  await axe(first, "login es");
  await first.getByRole("button", { name: "English" }).click();
  await expect(first.getByRole("heading", { name: "Log in" })).toBeVisible();
  await expect(first.locator("html")).toHaveAttribute("lang", "en");
  await axe(first, "login en");

  // The officials load the census and open the meeting.
  const mesa = await login(browser, "mesa@example.org");
  await mesa.getByRole("link", { name: "Mesa" }).click();
  await mesa.getByRole("button", { name: "Censo" }).click();
  await mesa.getByLabel("CSV del censo").fill(CENSUS);
  await mesa.getByRole("button", { name: "Importar" }).click();
  await expect(mesa.getByText("3 altas, 1 cambios, 0 bajas")).toBeVisible();
  await axe(mesa, "census");

  await mesa.getByRole("button", { name: "Sesión" }).click();
  await mesa.getByLabel("Título de la sesión").fill("Sesión ordinaria de ejemplo");
  await mesa.getByRole("button", { name: "Crear" }).click();
  await mesa.getByRole("button", { name: "Abrir" }).click();
  await expect(mesa.getByText("No hay quorum")).toBeVisible();
  await axe(mesa, "meeting");

  await mesa.getByRole("button", { name: "Asistencia" }).click();
  for (const name of ["Persona Mesa", "Persona Uno", "Persona Dos"]) await mesa.getByRole("button", { name: `Entrada presencial: ${name}` }).click();
  await expect(mesa.getByText("Hay quorum")).toBeVisible();
  await axe(mesa, "attendance");

  await mesa.getByRole("button", { name: "Delegaciones" }).click();
  await mesa.getByLabel("Delega", { exact: true }).selectOption({ label: "Persona Tres" });
  await mesa.getByLabel("En", { exact: true }).selectOption({ label: "Persona Uno" });
  await mesa.getByLabel("Justificada", { exact: true }).check();
  await mesa.getByRole("button", { name: "Registrar la delegación" }).click();
  await expect(mesa.getByText("Persona Tres → Persona Uno")).toBeVisible();
  await axe(mesa, "proxies");

  await mesa.getByRole("button", { name: "Votaciones" }).click();
  await mesa.getByLabel("Pregunta o cargo").fill("Aprobación del acta");
  await mesa.getByRole("button", { name: "Crear" }).click();
  const card = mesa.locator("article", { hasText: "Aprobación del acta" });
  await card.getByRole("button", { name: "Abrir" }).click();
  await expect(card.getByText("Abierta")).toBeVisible();
  await axe(mesa, "votings");

  // Voters: Persona Uno has two ballots (own and proxy).
  const uno = await login(browser, "uno@example.org");
  await expect(uno.getByText("Voto delegado 1")).toBeVisible({ timeout: 30_000 });
  await axe(uno, "ballot");
  await vote(uno, "Tu voto", "A favor");
  await vote(uno, "Voto delegado 1", "En contra");
  await axe(uno, "receipt");

  const dos = await login(browser, "dos@example.org");
  await expect(dos.getByText("Tu voto")).toBeVisible({ timeout: 30_000 });
  await vote(dos, "Tu voto", "A favor");
  // The officials vote from the voter view.
  await mesa.getByRole("link", { name: "Votar" }).click();
  await expect(mesa.getByText("Tu voto")).toBeVisible({ timeout: 30_000 });
  await vote(mesa, "Tu voto", "Abstención");

  // Persona Tres delegated and is not present: no ballot.
  const tres = await login(browser, "tres@example.org");
  await expect(tres.getByText("No estabas presente cuando se abrió esta votación.")).toBeVisible({ timeout: 30_000 });

  // Projection, then closing.
  const screen = await mesa.context().newPage();
  await screen.goto("/#/projection");
  await expect(screen.getByText("Huella de la clave")).toBeVisible();
  await axe(screen, "projection");

  await mesa.getByRole("link", { name: "Mesa" }).click();
  await mesa.getByRole("button", { name: "Votaciones" }).click();
  await mesa.locator("article", { hasText: "Aprobación del acta" }).getByRole("button", { name: "Cerrar" }).click();

  // Everyone sees the result and the individual check of their receipts.
  await expect(uno.getByText("Aprobada")).toBeVisible({ timeout: 30_000 });
  await expect(uno.getByText("Comprobado: tu voto está en el tablón")).toBeVisible();
  await expect(dos.getByText("Comprobado: tu voto está en el tablón")).toBeVisible({ timeout: 30_000 });
  await expect(screen.getByText("Aprobada")).toBeVisible({ timeout: 30_000 });
  await axe(uno, "result");
});
