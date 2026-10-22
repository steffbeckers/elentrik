import { afterEach, describe, expect, test, vi } from "vitest";
import { gebruikVerzender, maakVerzender, zetVerzender } from "../server/mail/verzend";

const mail = { aan: "jan@voorbeeld.be", onderwerp: "Hallo", tekst: "platte tekst", html: "<p>html</p>" };

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("mailverzender", () => {
  test("verstuur geeft from, to, subject, text en html door aan het transport", async () => {
    vi.stubEnv("SMTP_VAN", "Elentrik <noreply@elentrik.local>");
    const sendMail = vi.fn().mockResolvedValue({});
    await maakVerzender({ sendMail }).verstuur(mail);
    expect(sendMail).toHaveBeenCalledTimes(1);
    expect(sendMail).toHaveBeenCalledWith({
      from: "Elentrik <noreply@elentrik.local>",
      to: "jan@voorbeeld.be",
      subject: "Hallo",
      text: "platte tekst",
      html: "<p>html</p>",
    });
  });

  test("gebruikt een standaardafzender als SMTP_VAN ontbreekt", async () => {
    vi.stubEnv("SMTP_VAN", "");
    const sendMail = vi.fn().mockResolvedValue({});
    await maakVerzender({ sendMail }).verstuur(mail);
    expect(sendMail.mock.calls[0]![0].from).toBe("Elentrik <noreply@elentrik.local>");
  });

  test("een fout van het transport komt boven, ze wordt niet ingeslikt", async () => {
    const sendMail = vi.fn().mockRejectedValue(new Error("SMTP onbereikbaar"));
    await expect(maakVerzender({ sendMail }).verstuur(mail)).rejects.toThrow("SMTP onbereikbaar");
  });

  test("zetVerzender vervangt wat gebruikVerzender teruggeeft", async () => {
    const verstuur = vi.fn().mockResolvedValue(undefined);
    zetVerzender({ verstuur });
    await gebruikVerzender().verstuur(mail);
    expect(verstuur).toHaveBeenCalledWith(mail);
  });
});
