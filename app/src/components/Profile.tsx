import { useState } from "react";
import { riktvarde, type Profile } from "../planner";
import { sv } from "../format";
import { Button, Chip, ScreenHeader } from "./ui";

export function ProfileView({
  profile,
  onSave,
  onReset,
}: {
  profile: Profile;
  onSave: (p: Profile) => void;
  onReset: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);

  return (
    <div className="screen">
      <ScreenHeader title="Jag" subtitle="Dina mål och inställningar" />

      {editing ? (
        <ProfileForm
          profile={profile}
          onCancel={() => setEditing(false)}
          onSave={(p) => {
            onSave(p);
            setEditing(false);
          }}
        />
      ) : (
        <>
          <section className="card profile-card">
            <div className="profile-target">
              <div>
                <span className="profile-num">ca {profile.proteinTarget} g</span>
                <span className="muted small">protein per dag</span>
              </div>
              <div>
                <span className="profile-num">under {sv(profile.saltTarget, profile.saltTarget % 1 ? 1 : 0)} g</span>
                <span className="muted small">salt per dag</span>
              </div>
            </div>
            <p className={`source-label ${profile.targetSource === "riktvarde" ? "source-rikt" : "source-dietist"}`}>
              {profile.targetSource === "dietist"
                ? "Restriktioner från din dietist"
                : "Riktvärde enligt nationella riktlinjer, tills du träffat din dietist"}
            </p>
            <dl className="profile-facts">
              <div>
                <dt>Vikt</dt>
                <dd>{sv(profile.weightKg)} kg</dd>
              </div>
              <div>
                <dt>Portioner</dt>
                <dd>{profile.portions}</dd>
              </div>
              <div>
                <dt>Lagar</dt>
                <dd>{profile.effortPref === "enkel" ? "Bara enkla rätter" : "Alla rätter"}</dd>
              </div>
            </dl>
            <Button variant="secondary" full onClick={() => setEditing(true)}>
              Ändra
            </Button>
          </section>

          <section className="card">
            <h2>Börja om</h2>
            <p className="muted small">Rensar dina uppgifter, veckoplanen och inköpslistan på den här enheten.</p>
            {confirmReset ? (
              <div className="btn-row">
                <Button variant="ghost" full onClick={() => setConfirmReset(false)}>
                  Avbryt
                </Button>
                <Button variant="danger" full onClick={onReset}>
                  Ja, rensa allt
                </Button>
              </div>
            ) : (
              <Button variant="ghost" full onClick={() => setConfirmReset(true)}>
                Börja om
              </Button>
            )}
          </section>
        </>
      )}

      <footer className="disclaimer">
        <p>Appen är gjord för njursvikt utan dialys. Siffrorna är ungefärliga och ersätter inte råd från din dietist eller läkare.</p>
        <p className="muted small">
          Tröskelvärden, riktvärden och regeln för hur veckan jämnas ut är antaganden som ska granskas av dietist.
          Recept från köket.se används bara för intern demo.
        </p>
      </footer>
    </div>
  );
}

function ProfileForm({
  profile,
  onSave,
  onCancel,
}: {
  profile: Profile;
  onSave: (p: Profile) => void;
  onCancel: () => void;
}) {
  const [weight, setWeight] = useState(String(profile.weightKg));
  const [hasDietist, setHasDietist] = useState(profile.targetSource === "dietist");
  const [protein, setProtein] = useState(String(profile.proteinTarget));
  const [salt, setSalt] = useState(String(profile.saltTarget));
  const [portions, setPortions] = useState(profile.portions);
  const [effortPref, setEffortPref] = useState<Profile["effortPref"]>(profile.effortPref);

  const weightNum = Number(weight.replace(",", "."));
  const weightOk = Number.isFinite(weightNum) && weightNum >= 30 && weightNum <= 250;
  const proteinNum = Number(protein.replace(",", "."));
  const saltNum = Number(salt.replace(",", "."));
  const dietistOk = Number.isFinite(proteinNum) && proteinNum > 0 && Number.isFinite(saltNum) && saltNum > 0;
  const rikt = weightOk ? riktvarde(weightNum) : null;
  const canSave = weightOk && (!hasDietist || dietistOk);

  function save() {
    if (!canSave) return;
    const target = hasDietist ? { protein: proteinNum, salt: saltNum } : riktvarde(weightNum);
    onSave({
      ...profile,
      weightKg: weightNum,
      proteinTarget: Math.round(target.protein),
      saltTarget: Math.round(target.salt * 10) / 10,
      targetSource: hasDietist ? "dietist" : "riktvarde",
      portions,
      effortPref,
    });
  }

  return (
    <section className="card">
      <h2>Ändra uppgifter</h2>
      <label className="field">
        <span className="field-label">Vikt</span>
        <span className="field-input">
          <input type="number" inputMode="decimal" min={30} max={250} value={weight} onChange={(e) => setWeight(e.target.value)} />
          <span className="field-unit">kg</span>
        </span>
      </label>

      <p className="field-label">Restriktioner från dietist?</p>
      <div className="chip-row">
        <Chip active={hasDietist} onClick={() => setHasDietist(true)}>
          Ja
        </Chip>
        <Chip active={!hasDietist} onClick={() => setHasDietist(false)}>
          Nej, använd riktvärde
        </Chip>
      </div>

      {hasDietist ? (
        <div className="ob-fields">
          <label className="field">
            <span className="field-label">Protein</span>
            <span className="field-input">
              <input type="number" inputMode="decimal" min={20} max={150} value={protein} onChange={(e) => setProtein(e.target.value)} />
              <span className="field-unit">g/dag</span>
            </span>
          </label>
          <label className="field">
            <span className="field-label">Salt</span>
            <span className="field-input">
              <input type="number" inputMode="decimal" min={1} max={10} step={0.5} value={salt} onChange={(e) => setSalt(e.target.value)} />
              <span className="field-unit">g/dag</span>
            </span>
          </label>
        </div>
      ) : rikt ? (
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
        </div>
      ) : null}

      <p className="field-label">Portioner</p>
      <div className="chip-row">
        {[1, 2, 3, 4].map((n) => (
          <Chip key={n} active={portions === n} onClick={() => setPortions(n)}>
            {n}
          </Chip>
        ))}
      </div>

      <p className="field-label">Hur vill du laga?</p>
      <div className="chip-row">
        <Chip active={effortPref === "alla"} onClick={() => setEffortPref("alla")}>
          Alla rätter
        </Chip>
        <Chip active={effortPref === "enkel"} onClick={() => setEffortPref("enkel")}>
          Bara enkla
        </Chip>
      </div>

      <div className="btn-row">
        <Button variant="ghost" full onClick={onCancel}>
          Avbryt
        </Button>
        <Button full disabled={!canSave} onClick={save}>
          Spara
        </Button>
      </div>
      <p className="muted small">När du sparar räknar vi om veckans middagar efter de nya målen.</p>
    </section>
  );
}
