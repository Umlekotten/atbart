import { useState } from "react";
import { riktvarde, type Profile } from "../planner";
import { Button, Chip } from "./ui";
import { sv } from "../format";
import { APP_NAME, APP_TAGLINE } from "../appName";

type Step = "intro" | "vikt" | "mal" | "prefs";

const STEP_ORDER: Step[] = ["intro", "vikt", "mal", "prefs"];

export function Onboarding({ onDone }: { onDone: (profile: Profile) => void }) {
  const [step, setStep] = useState<Step>("intro");
  const [weight, setWeight] = useState("");
  const [hasDietist, setHasDietist] = useState<boolean | null>(null);
  const [protein, setProtein] = useState("");
  const [salt, setSalt] = useState("");
  const [portions, setPortions] = useState(1);
  const [effortPref, setEffortPref] = useState<Profile["effortPref"]>("alla");

  const weightNum = Number(weight.replace(",", "."));
  const weightOk = Number.isFinite(weightNum) && weightNum >= 30 && weightNum <= 250;
  const rikt = weightOk ? riktvarde(weightNum) : null;
  const proteinNum = Number(protein.replace(",", "."));
  const saltNum = Number(salt.replace(",", "."));
  const dietistOk = Number.isFinite(proteinNum) && proteinNum > 0 && Number.isFinite(saltNum) && saltNum > 0;

  function finish() {
    if (!weightOk) return;
    const useDietist = hasDietist === true && dietistOk;
    const target = useDietist ? { protein: proteinNum, salt: saltNum } : riktvarde(weightNum);
    onDone({
      weightKg: weightNum,
      proteinTarget: Math.round(target.protein),
      saltTarget: Math.round(target.salt * 10) / 10,
      targetSource: useDietist ? "dietist" : "riktvarde",
      dialysis: false,
      portions,
      effortPref,
    });
  }

  const stepIndex = STEP_ORDER.indexOf(step);

  return (
    <div className="onboarding">
      <div className="ob-progress" aria-hidden="true">
        {STEP_ORDER.map((s, i) => (
          <span key={s} className={`ob-dot${i <= stepIndex ? " ob-dot-on" : ""}`} />
        ))}
      </div>

      {step === "intro" && (
        <section className="ob-card ob-intro">
          <p className="ob-kicker">Njurvänlig vardagsmat</p>
          <h1 className="ob-title">{APP_NAME}</h1>
          <p className="ob-lead">{APP_TAGLINE}</p>
          <Button full onClick={() => setStep("vikt")}>
            Kom igång
          </Button>
        </section>
      )}

      {step === "vikt" && (
        <section className="ob-card">
          <h2>Vad väger du?</h2>
          <p className="muted">Vikten används bara för att räkna ut ett riktvärde om du inte har ett mål från din dietist.</p>
          <label className="field">
            <span className="field-label">Vikt</span>
            <span className="field-input">
              <input
                type="number"
                inputMode="decimal"
                min={30}
                max={250}
                placeholder="t.ex. 68"
                value={weight}
                onChange={(e) => setWeight(e.target.value)}
                autoFocus
              />
              <span className="field-unit">kg</span>
            </span>
          </label>
          <Button full disabled={!weightOk} onClick={() => setStep("mal")}>
            Nästa
          </Button>
          <BackLink onClick={() => setStep("intro")} />
        </section>
      )}

      {step === "mal" && (
        <section className="ob-card">
          <h2>Har du fått restriktioner från din dietist?</h2>
          <div className="chip-row">
            <Chip active={hasDietist === true} onClick={() => setHasDietist(true)}>
              Ja
            </Chip>
            <Chip active={hasDietist === false} onClick={() => setHasDietist(false)}>
              Nej, inte än
            </Chip>
          </div>

          {hasDietist === true && (
            <div className="ob-fields">
              <label className="field">
                <span className="field-label">Protein</span>
                <span className="field-input">
                  <input
                    type="number"
                    inputMode="decimal"
                    min={20}
                    max={150}
                    placeholder="t.ex. 55"
                    value={protein}
                    onChange={(e) => setProtein(e.target.value)}
                  />
                  <span className="field-unit">g/dag</span>
                </span>
              </label>
              <label className="field">
                <span className="field-label">Salt</span>
                <span className="field-input">
                  <input
                    type="number"
                    inputMode="decimal"
                    min={1}
                    max={10}
                    step={0.5}
                    placeholder="t.ex. 5"
                    value={salt}
                    onChange={(e) => setSalt(e.target.value)}
                  />
                  <span className="field-unit">g/dag</span>
                </span>
              </label>
            </div>
          )}

          {hasDietist === false && rikt && (
            <div className="rikt-card">
              <p className="rikt-label">Riktvärde enligt nationella riktlinjer, tills du träffat din dietist</p>
              <div className="rikt-values">
                <div>
                  <span className="rikt-num">ca {rikt.protein} g</span>
                  <span className="rikt-what">protein per dag</span>
                </div>
                <div>
                  <span className="rikt-num">under {sv(rikt.salt)} g</span>
                  <span className="rikt-what">salt per dag</span>
                </div>
              </div>
              <p className="muted small">0,8 g protein per kilo kroppsvikt. Din dietist kan ge dig ett personligt mål.</p>
            </div>
          )}

          <Button
            full
            disabled={hasDietist === null || (hasDietist === true && !dietistOk)}
            onClick={() => setStep("prefs")}
          >
            Nästa
          </Button>
          <BackLink onClick={() => setStep("vikt")} />
        </section>
      )}

      {step === "prefs" && (
        <section className="ob-card">
          <h2>Hur många portioner lagar du?</h2>
          <div className="chip-row">
            {[1, 2, 3, 4].map((n) => (
              <Chip key={n} active={portions === n} onClick={() => setPortions(n)}>
                {n}
              </Chip>
            ))}
          </div>
          <h2 className="mt">Hur vill du laga?</h2>
          <div className="chip-row">
            <Chip active={effortPref === "alla"} onClick={() => setEffortPref("alla")}>
              Alla rätter
            </Chip>
            <Chip active={effortPref === "enkel"} onClick={() => setEffortPref("enkel")}>
              Bara enkla
            </Chip>
          </div>
          <p className="muted small">
            Enkla rätter tar under en halvtimme och kräver inte mycket ork. Du kan ändra det här senare.
          </p>
          <Button full disabled={!weightOk} onClick={finish}>
            Skapa min vecka
          </Button>
          <BackLink onClick={() => setStep("mal")} />
        </section>
      )}
    </div>
  );
}

function BackLink({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" className="link-btn" onClick={onClick}>
      Tillbaka
    </button>
  );
}
