import { afterEach, describe, expect, test, vi } from "vitest";
import { gebruikVerzender, maakVerzender, smtpOpties, smtpPoort, zetVerzender } from "../server/mail/verzend";

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

  test("een mail zonder ontvanger wordt geweigerd en niet doorgegeven", async () => {
    const sendMail = vi.fn().mockResolvedValue({});
    await expect(maakVerzender({ sendMail }).verstuur({ ...mail, aan: "" })).rejects.toThrow(
      "zonder ontvanger",
    );
    await expect(maakVerzender({ sendMail }).verstuur({ ...mail, aan: "  " })).rejects.toThrow(
      "zonder ontvanger",
    );
    expect(sendMail).not.toHaveBeenCalled();
  });
});

describe("smtpPoort", () => {
  test("een geldige poort wordt gebruikt", () => {
    expect(smtpPoort("2525")).toBe(2525);
    expect(smtpPoort("65535")).toBe(65535);
  });

  test("een ontbrekende of ongeldige poort valt terug op 1025", () => {
    for (const waarde of [undefined, "", "abc", "12x", "0", "-5", "70000", "25.5", "NaN"]) {
      expect(smtpPoort(waarde)).toBe(1025);
    }
  });
});

describe("smtpOpties", () => {
  test("zonder aanmelding of TLS: zoals Mailpit lokaal", () => {
    expect(smtpOpties({})).toEqual({ host: "127.0.0.1", port: 1025, secure: false });
    expect(smtpOpties({ SMTP_HOST: "mail.local", SMTP_PORT: "2525" })).toEqual({
      host: "mail.local",
      port: 2525,
      secure: false,
    });
  });

  test("met gebruiker, wachtwoord en SMTP_BEVEILIGD=true: aanmelding en TLS", () => {
    expect(
      smtpOpties({
        SMTP_HOST: "smtp.voorbeeld.be",
        SMTP_PORT: "465",
        SMTP_GEBRUIKER: "elentrik",
        SMTP_WACHTWOORD: "geheim-wachtwoord",
        SMTP_BEVEILIGD: "true",
      }),
    ).toEqual({
      host: "smtp.voorbeeld.be",
      port: 465,
      secure: true,
      auth: { user: "elentrik", pass: "geheim-wachtwoord" },
    });
  });

  test("alleen true (ongeacht hoofdletters) zet TLS aan; een gebruiker zonder wachtwoord (of omgekeerd) meldt niet aan", () => {
    for (const waarde of ["", "false", "1", "ja"]) {
      expect(smtpOpties({ SMTP_BEVEILIGD: waarde }).secure, waarde).toBe(false);
    }
    expect(smtpOpties({ SMTP_BEVEILIGD: " TRUE " }).secure).toBe(true);
    expect(smtpOpties({ SMTP_GEBRUIKER: "elentrik" })).not.toHaveProperty("auth");
    expect(smtpOpties({ SMTP_WACHTWOORD: "geheim" })).not.toHaveProperty("auth");
  });
});
