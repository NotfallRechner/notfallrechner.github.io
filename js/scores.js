// Score definitions and evaluation. No DOM access, so the same file runs in
// the browser (window.KlinikScores) and under Node for the tests.
(function (root) {
  'use strict';

  const CONFIG = typeof module !== 'undefined' && module.exports ? require('./config.js') : root.NotfallConfig;
  const SYRINGES = CONFIG.perfusor.syringes;

  const bool = (id, label, points, hint) => ({ id, type: 'bool', label, points, hint });
  // Yes/no input that feeds a formula instead of adding points.
  const flag = (id, label, hint) => ({ id, type: 'bool', label, hint });
  const choice = (id, label, options, hint) => ({ id, type: 'choice', label, options, hint });
  const opt = (points, label, extra) => Object.assign({ points, label }, extra);
  // Option without points, for scores that are calculated by a formula.
  const pick = (label, extra) => Object.assign({ label }, extra);
  const UN = (label) => opt(0, label, { key: 'UN', untestable: true });
  // Numeric input. Values are stored in the first (canonical) unit; `factor`
  // converts an entry in that unit to the canonical one. min/max are canonical.
  const num = (id, label, units, min, max, extra) => Object.assign({ id, type: 'number', label, units, min, max }, extra);
  const unit = (label, factor, decimals) => ({ label, factor, decimals });
  // Section title inside a form; carries no value.
  const heading = (label) => ({ type: 'heading', label });

  const CREA = [unit('mg/dl', 1, 2), unit('µmol/l', 1 / 88.4, 0)];
  const BILI = [unit('mg/dl', 1, 2), unit('µmol/l', 1 / 17.1, 0)];
  const ALB = [unit('g/dl', 1, 1), unit('g/l', 0.1, 0)];
  const MMOL = [unit('mmol/l', 1, 1)];
  const UCREA = [unit('mg/dl', 1, 1), unit('µmol/l', 1 / 88.4, 0), unit('mmol/l', 1000 / 88.4, 2)];
  // Canonical: urea (Harnstoff) in mg/dl; BUN × 2,14 = Harnstoff.
  const UREA = [unit('mg/dl', 1, 0), unit('mmol/l', 6.006, 1), unit('BUN mg/dl', 2.14, 0)];
  const KG = [unit('kg', 1, 1)];
  const YEARS = [unit('Jahre', 1, 0)];
  const PER_MIN = [unit('/min', 1, 0)];
  const MMHG = [unit('mmHg', 1, 0)];
  const GLU = [unit('mg/dl', 1, 0), unit('mmol/l', 18.016, 1)];
  const ETOH = [unit('mg/dl', 1, 0), unit('g/l', 100, 2), unit('mmol/l', 4.607, 1)];
  const CA = [unit('mmol/l', 1, 2), unit('mg/dl', 0.2495, 1)];
  const HB = [unit('g/dl', 1, 1), unit('g/l', 0.1, 0), unit('mmol/l', 1.611, 1)];
  const SEX = (id) => choice(id, 'Geschlecht', [pick('Männlich', { key: 'm' }), pick('Weiblich', { key: 'f' })]);

  // Inputs with the same `shared` key are filled in from one calculator to the
  // next during a session; all of them must use the same canonical unit.
  const SHARED = (key) => ({ shared: key });

  const GROUPS = [
    'Notfall & Intensiv',
    'Trauma',
    'Infektionen',
    'Kardiologie',
    'Thrombose & Embolie',
    'Neurologie',
    'Gastro & Leber',
    'Niere & Labor',
    'Medikamente & Infusion',
  ];

  const SCORES = [
    {
      id: 'qsofa',
      group: 'Notfall & Intensiv',
      short: 'qSOFA',
      title: 'qSOFA',
      subtitle: 'Sepsis-3: Risiko für einen ungünstigen Verlauf bei Infektverdacht',
      keywords: 'Sepsis Infektion Notaufnahme',
      usage: {
        when: 'Erwachsene mit vermuteter oder gesicherter Infektion außerhalb der Intensivstation (Präklinik, Notaufnahme, Normalstation), um Patienten mit erhöhtem Risiko für einen ungünstigen Verlauf schnell und ohne Labor zu erkennen.',
        not: 'Kein Screening- oder Ausschlussinstrument für Sepsis: Die Surviving Sepsis Campaign 2021 rät davon ab, qSOFA allein zum Sepsis-Screening einzusetzen. Auf der Intensivstation den SOFA-Score verwenden.',
      },
      items: [
        bool('af', 'Atemfrequenz ≥ 22/min', 1),
        bool('gcs', 'Veränderte Bewusstseinslage', 1, 'GCS < 15'),
        bool('sbp', 'Systolischer Blutdruck ≤ 100 mmHg', 1),
      ],
      interpret(total) {
        if (total >= 2) {
          return {
            level: 'high',
            label: 'qSOFA positiv',
            text: 'Erhöhtes Risiko für einen ungünstigen Verlauf (Krankenhausletalität in der Ableitungsstudie 3- bis 14-fach erhöht). Organdysfunktion prüfen (SOFA), Therapie eskalieren, Intensivmedizin früh einbeziehen.',
          };
        }
        return {
          level: 'low',
          label: 'qSOFA negativ',
          text: 'Nach qSOFA kein erhöhtes Risiko. Eine Sepsis ist damit nicht ausgeschlossen – bei klinischem Verdacht weiter abklären.',
        };
      },
      related: [
        { id: 'sofa', text: 'Organdysfunktion mit dem SOFA-Score erfassen', when: (t) => t >= 2 },
        { id: 'news2', text: 'Verlauf mit NEWS2 überwachen' },
      ],
      sources: [
        { label: 'Seymour CW et al. Assessment of Clinical Criteria for Sepsis. JAMA 2016;315(8):762–774', url: 'https://doi.org/10.1001/jama.2016.0288' },
        { label: 'Singer M et al. Sepsis-3. JAMA 2016;315(8):801–810', url: 'https://doi.org/10.1001/jama.2016.0287' },
      ],
    },

    {
      id: 'sofa',
      group: 'Notfall & Intensiv',
      short: 'SOFA',
      title: 'SOFA-Score',
      subtitle: 'Sequential Organ Failure Assessment: Organdysfunktion in sechs Systemen (0–24 Punkte)',
      keywords: 'Sepsis Intensivstation Organversagen Organdysfunktion',
      usage: {
        when: 'Intensivpatienten: Ausmaß der Organdysfunktion erfassen und im Verlauf (typischerweise täglich) verfolgen. Nach Sepsis-3 liegt eine Sepsis vor, wenn eine Infektion mit einem akuten Anstieg des SOFA um ≥ 2 Punkte einhergeht.',
        not: 'Nicht zur Therapieentscheidung beim einzelnen Patienten entwickelt. Vorbestehende Organdysfunktionen (z. B. chronische Niereninsuffizienz) heben den Ausgangswert – entscheidend ist die akute Änderung. Jeweils den schlechtesten Wert der letzten 24 Stunden verwenden.',
      },
      items: [
        num('pao2', 'PaO₂', [unit('mmHg', 1, 0), unit('kPa', 7.50062, 1)], 20, 700, { hint: 'arteriell, aus der Blutgasanalyse' }),
        num('fio2', 'FiO₂', [unit('%', 1, 0)], 21, 100, { hint: 'Raumluft = 21 %' }),
        flag('vent', 'Atemunterstützung', 'invasive oder nicht-invasive Beatmung – Voraussetzung für 3 oder 4 Punkte'),
        num('plt', 'Thrombozyten', [unit('/nl', 1, 0)], 0, 2000, { shared: 'plt', hint: '/nl = 10³/µl' }),
        num('bili', 'Bilirubin', BILI, 0, 70, SHARED('bili')),
        choice('cv', 'Kreislauf', [
          opt(0, 'MAP ≥ 70 mmHg'),
          opt(1, 'MAP < 70 mmHg'),
          opt(2, 'Dopamin ≤ 5 oder Dobutamin', { hint: 'Dobutamin in jeder Dosis' }),
          opt(3, 'Dopamin > 5 oder (Nor-)Adrenalin ≤ 0,1'),
          opt(4, 'Dopamin > 15 oder (Nor-)Adrenalin > 0,1'),
        ], 'Dosen in µg/kg/min, mindestens eine Stunde verabreicht'),
        choice('gcs', 'Glasgow Coma Scale', [
          opt(0, '15'),
          opt(1, '13–14'),
          opt(2, '10–12'),
          opt(3, '6–9'),
          opt(4, '< 6'),
        ], 'Bei Sedierung den angenommenen Wert ohne Sedierung'),
        num('crea', 'Kreatinin', CREA, 0.1, 30, SHARED('crea')),
        choice('uo', 'Urinausscheidung', [
          opt(0, '≥ 500 ml/Tag oder nicht bestimmt'),
          opt(3, '< 500 ml/Tag'),
          opt(4, '< 200 ml/Tag'),
        ], 'Für die Niere zählt der höhere Wert aus Kreatinin und Urinmenge'),
      ],
      max: 24,
      compute(a) {
        const p = sofaParts(a);
        return p.resp + p.coag + p.liver + p.cv + p.cns + p.renal;
      },
      interpret(total, a) {
        const p = sofaParts(a);
        const parts = `Atmung ${p.resp} · Gerinnung ${p.coag} · Leber ${p.liver} · Kreislauf ${p.cv} · ZNS ${p.cns} · Niere ${p.renal} (PaO₂/FiO₂ ${Math.round(p.pf)} mmHg).`;
        if (total <= 1) return { level: 'low', label: 'Keine relevante Organdysfunktion', text: parts };
        if (total <= 6) return { level: 'mid', label: 'Organdysfunktion', text: `${parts} Letalität bei einem initialen SOFA von 0–6 unter 10 %.` };
        if (total <= 9) return { level: 'mid', label: 'Ausgeprägte Organdysfunktion', text: `${parts} Letalität bei einem initialen SOFA von 7–9 etwa 15–20 %.` };
        if (total <= 12) return { level: 'high', label: 'Schweres Multiorganversagen', text: `${parts} Letalität bei einem initialen SOFA von 10–12 etwa 40–50 %.` };
        if (total <= 14) return { level: 'high', label: 'Schweres Multiorganversagen', text: `${parts} Letalität bei einem initialen SOFA von 13–14 etwa 50–60 %.` };
        return { level: 'high', label: 'Schweres Multiorganversagen', text: `${parts} Letalität bei einem initialen SOFA ≥ 15 über 80 %.` };
      },
      notes: [
        'Letalitätsangaben nach Ferreira 2001 (belgische Intensivkohorte); der Verlauf in den ersten 48 Stunden ist prognostisch aussagekräftiger als der Einzelwert.',
        'Bilirubin und Kreatinin: 1,2–1,9 / 2,0–5,9 / 6,0–11,9 / ≥ 12 mg/dl bzw. 1,2–1,9 / 2,0–3,4 / 3,5–4,9 / ≥ 5 mg/dl entsprechen 1–4 Punkten.',
      ],
      sources: [
        { label: 'Vincent JL et al. The SOFA (Sepsis-related Organ Failure Assessment) score to describe organ dysfunction/failure. Intensive Care Med 1996;22:707–710', url: 'https://doi.org/10.1007/BF01709751' },
        { label: 'Ferreira FL et al. Serial evaluation of the SOFA score to predict outcome in critically ill patients. JAMA 2001;286(14):1754–1758', url: 'https://doi.org/10.1001/jama.286.14.1754' },
      ],
    },

    {
      id: 'gcs',
      group: 'Notfall & Intensiv',
      short: 'GCS',
      title: 'Glasgow Coma Scale',
      subtitle: 'Bewusstseinslage anhand von Augenöffnen, verbaler und motorischer Reaktion (3–15 Punkte)',
      keywords: 'Bewusstsein Koma SHT Schädel-Hirn-Trauma Vigilanz',
      usage: {
        when: 'Jede Vigilanzminderung, besonders Schädel-Hirn-Trauma, Intoxikation, ZNS-Infektion und nach Reanimation – zur Einstufung und vor allem als Verlaufsparameter. Gewertet wird jeweils die beste Reaktion.',
        not: 'Eingeschränkt aussagekräftig bei Intubation, Sedierung, Aphasie, Hörstörung oder Lidschwellung – dann die Einzelkomponenten (E, V, M) dokumentieren. Für Kinder unter 5 Jahren die pädiatrische GCS verwenden.',
      },
      items: [
        choice('e', 'Augenöffnen (E)', [
          opt(4, 'Spontan'),
          opt(3, 'Auf Ansprache'),
          opt(2, 'Auf Schmerzreiz', { hint: 'Druck auf Fingernagel, Trapezius oder Supraorbitalrand' }),
          opt(1, 'Keine Reaktion'),
          opt(1, 'Nicht beurteilbar', { badge: 'NT', untestable: true, hint: 'z. B. Lidschwellung – als 1 gewertet, „NT“ dokumentieren' }),
        ]),
        choice('v', 'Verbale Reaktion (V)', [
          opt(5, 'Orientiert'),
          opt(4, 'Verwirrt', { hint: 'spricht in Sätzen, aber desorientiert' }),
          opt(3, 'Einzelne Wörter', { hint: 'unzusammenhängend, unangemessen' }),
          opt(2, 'Unverständliche Laute'),
          opt(1, 'Keine Reaktion'),
          opt(1, 'Nicht beurteilbar (intubiert)', { badge: 'T', untestable: true, hint: 'als 1 gewertet, mit „T“ dokumentieren, z. B. 8T' }),
        ]),
        choice('m', 'Motorische Reaktion (M)', [
          opt(6, 'Befolgt Aufforderungen'),
          opt(5, 'Gezielte Abwehr', { hint: 'lokalisiert den Schmerzreiz' }),
          opt(4, 'Ungezielte Beugung', { hint: 'normales Wegziehen' }),
          opt(3, 'Abnorme Beugung', { hint: 'Beugesynergismen' }),
          opt(2, 'Streckung', { hint: 'Strecksynergismen' }),
          opt(1, 'Keine Reaktion'),
        ]),
      ],
      interpret(total, a) {
        const part = (letter, o) => `${letter}${o.points}${o.badge ? ` (${o.badge})` : ''}`;
        const code = [part('E', a.e), part('V', a.v), part('M', a.m)].join(' ');
        if (a.v.badge === 'T') {
          return { level: total >= 9 ? 'mid' : 'high', label: `GCS ${total}T`, text: `${code}. Verbale Reaktion nicht beurteilbar – die Summe ist nur eingeschränkt mit nicht intubierten Patienten vergleichbar; im Verlauf vor allem die motorische Komponente beachten.` };
        }
        if (total >= 13) return { level: 'low', label: 'Leichte Bewusstseinsstörung', text: `${code}. Bei Schädel-Hirn-Trauma: leichtes SHT (GCS 13–15).` };
        if (total >= 9) return { level: 'mid', label: 'Mittelschwere Bewusstseinsstörung', text: `${code}. Bei Schädel-Hirn-Trauma: mittelschweres SHT (GCS 9–12). Engmaschige neurologische Kontrolle.` };
        return { level: 'high', label: 'Schwere Bewusstseinsstörung / Koma', text: `${code}. Bei Schädel-Hirn-Trauma: schweres SHT (GCS ≤ 8). Schutzreflexe gefährdet – Atemwegssicherung erwägen.` };
      },
      notes: [
        'Die Einzelkomponenten sind aussagekräftiger als die Summe; ein Abfall um ≥ 2 Punkte ist ein Warnzeichen.',
      ],
      related: [
        { id: 'ct-head', text: 'Leichtes SHT: Canadian CT Head Rule', when: (t) => t >= 13 },
      ],
      sources: [
        { label: 'Teasdale G, Jennett B. Assessment of coma and impaired consciousness. A practical scale. Lancet 1974;2(7872):81–84', url: 'https://doi.org/10.1016/S0140-6736(74)91639-0' },
        { label: 'Teasdale G et al. The Glasgow Coma Scale at 40 years: standing the test of time. Lancet Neurol 2014;13(8):844–854', url: 'https://doi.org/10.1016/S1474-4422(14)70120-6' },
      ],
    },

    {
      id: 'news2',
      group: 'Notfall & Intensiv',
      short: 'NEWS2',
      title: 'NEWS2',
      subtitle: 'National Early Warning Score 2: klinische Verschlechterung früh erkennen (0–20 Punkte)',
      keywords: 'Frühwarnscore Early Warning Vitalparameter Verschlechterung Sepsis Station MEWS',
      usage: {
        when: 'Erwachsene in Notaufnahme und auf Station: standardisierte Bewertung der Vitalparameter, um eine Verschlechterung früh zu erkennen und die Reaktion festzulegen – Überwachungsfrequenz, ärztliche Beurteilung, Intensivteam. Auch als Screening bei Infektverdacht.',
        not: 'Nicht validiert für Kinder unter 16 Jahren und Schwangere (dort eigene Scores). Ersetzt nicht die klinische Einschätzung – bei Sorge um den Patienten auch bei niedrigem Wert eskalieren. SpO₂-Skala 2 nur bei ärztlich festgelegtem Zielbereich 88–92 %.',
      },
      items: [
        num('af', 'Atemfrequenz', PER_MIN, 1, 80),
        num('spo2', 'Sauerstoffsättigung (SpO₂)', [unit('%', 1, 0)], 50, 100),
        flag('scale2', 'SpO₂-Skala 2 (Zielbereich 88–92 %)', 'nur bei ärztlich festgelegtem Ziel, z. B. hyperkapnische respiratorische Insuffizienz'),
        choice('o2', 'Atemluft', [
          opt(0, 'Raumluft', { key: 'air' }),
          opt(2, 'Sauerstoffgabe', { key: 'o2', hint: 'jede Form, auch High-Flow oder NIV' }),
        ]),
        num('sbp', 'Systolischer Blutdruck', MMHG, 30, 300, SHARED('sbp')),
        num('hr', 'Herzfrequenz', PER_MIN, 20, 250, SHARED('hr')),
        choice('cns', 'Bewusstsein (ACVPU)', [
          opt(0, 'Wach (A)'),
          opt(3, 'Neu verwirrt oder nur auf Ansprache, Schmerz oder nicht reagierend', { hint: 'C, V, P oder U' }),
        ]),
        num('temp', 'Körpertemperatur', [unit('°C', 1, 1)], 25, 45),
      ],
      max: 20,
      compute(a) {
        const p = news2Parts(a);
        return p.af + p.spo2 + p.o2 + p.sbp + p.hr + p.cns + p.temp;
      },
      interpret(total, a) {
        const p = news2Parts(a);
        const parts = `Atemfrequenz ${p.af} · SpO₂ ${p.spo2} · O₂ ${p.o2} · Blutdruck ${p.sbp} · Puls ${p.hr} · Bewusstsein ${p.cns} · Temperatur ${p.temp}.`;
        if (total >= 7) return { level: 'high', label: 'Hohes Risiko', text: `${parts} Notfallreaktion: kontinuierliche Überwachung, sofortige Beurteilung durch ein Team mit intensivmedizinischer Kompetenz, Verlegung auf eine höhere Versorgungsstufe erwägen.` };
        if (total >= 5) return { level: 'mid', label: 'Mittleres Risiko', text: `${parts} Dringliche Reaktion: Vitalparameter mindestens stündlich, zeitnahe Beurteilung durch einen in Akutmedizin erfahrenen Arzt; an Sepsis denken.` };
        if (p.red) return { level: 'mid', label: 'Niedrig-mittleres Risiko', text: `${parts} Ein Einzelparameter mit 3 Punkten: Vitalparameter mindestens stündlich, dringende ärztliche Beurteilung auf Station.` };
        if (total >= 1) return { level: 'low', label: 'Niedriges Risiko', text: `${parts} Vitalparameter mindestens alle 4–6 Stunden; Pflegekraft entscheidet über eine frühere Kontrolle oder Eskalation.` };
        return { level: 'low', label: 'Kein Hinweis auf Verschlechterung', text: `${parts} Vitalparameter mindestens alle 12 Stunden.` };
      },
      notes: [
        'SpO₂-Skala 1: ≥ 96 % 0, 94–95 % 1, 92–93 % 2, ≤ 91 % 3 Punkte. Skala 2: 88–92 % (oder ≥ 93 % unter Raumluft) 0 Punkte; unter Sauerstoff 93–94 % 1, 95–96 % 2, ≥ 97 % 3 Punkte; 86–87 % 1, 84–85 % 2, ≤ 83 % 3 Punkte.',
        'Ein neu aufgetretener Verwirrtheitszustand zählt wie eine Bewusstseinsstörung (3 Punkte).',
      ],
      related: [
        { id: 'qsofa', text: 'Bei Infektverdacht: qSOFA', when: (t) => t >= 5 },
        { id: 'shock-index', text: 'Kreislauf mit dem Schockindex einschätzen' },
      ],
      sources: [
        { label: 'Royal College of Physicians. National Early Warning Score (NEWS) 2: Standardising the assessment of acute-illness severity in the NHS. London: RCP, 2017', url: 'https://www.rcp.ac.uk/improving-care/resources/national-early-warning-score-news-2/' },
        { label: 'Smith GB et al. The ability of the National Early Warning Score (NEWS) to discriminate patients at risk of early cardiac arrest, unanticipated intensive care unit admission, and death. Resuscitation 2013;84(4):465–470', url: 'https://doi.org/10.1016/j.resuscitation.2012.12.016' },
      ],
    },

    {
      id: 'shock-index',
      group: 'Notfall & Intensiv',
      short: 'Schockindex',
      title: 'Schockindex',
      subtitle: 'Herzfrequenz geteilt durch systolischen Blutdruck',
      keywords: 'Shock Index Allgöwer Schock Blutung Volumenmangel Hypovolämie',
      unit: '',
      usage: {
        when: 'Schnelle Einschätzung eines Volumenmangel- oder hämorrhagischen Schocks, z. B. bei Trauma, gastrointestinaler Blutung oder Sepsis – auch präklinisch, da nur Puls und Blutdruck nötig sind.',
        not: 'Unzuverlässig unter Betablockern, bei Herzschrittmacher, Hypertonie, älteren Patienten und in der Schwangerschaft. Ein normaler Wert schließt einen Schock nicht aus; Verlauf und Klinik (Laktat, Rekapillarisierung, Bewusstsein) beachten.',
      },
      items: [
        num('hr', 'Herzfrequenz', PER_MIN, 20, 250, SHARED('hr')),
        num('sbp', 'Systolischer Blutdruck', MMHG, 30, 300, SHARED('sbp')),
      ],
      max: null,
      compute(a) {
        return Math.round((a.hr / a.sbp) * 100) / 100;
      },
      interpret(total) {
        if (total < 0.7) return { level: 'low', label: 'Normal', text: 'Normbereich etwa 0,5–0,7.' };
        if (total < 1) return { level: 'mid', label: 'Erhöht', text: 'Hinweis auf eine beginnende Kreislaufbelastung; engmaschig kontrollieren.' };
        return { level: 'high', label: 'Schock wahrscheinlich', text: 'Ein Schockindex ≥ 1 spricht für einen manifesten Schock, z. B. durch relevanten Blutverlust. Ursache suchen, Volumen- bzw. Blutproduktgabe vorbereiten.' };
      },
      related: [
        { id: 'news2', text: 'Gesamtbild der Vitalparameter mit NEWS2' },
      ],
      sources: [
        { label: 'Allgöwer M, Burri C. „Schockindex“. Dtsch Med Wochenschr 1967;92(43):1947–1950', url: 'https://doi.org/10.1055/s-0028-1106070' },
      ],
    },

    {
      id: 'pbw',
      group: 'Notfall & Intensiv',
      short: 'Tidalvolumen',
      title: 'Idealgewicht und Tidalvolumen',
      subtitle: 'Lungenprotektive Beatmung: Tidalvolumen nach dem Idealgewicht (predicted body weight)',
      keywords: 'Beatmung Tidalvolumen Idealgewicht PBW predicted body weight ARDS lungenprotektiv Respirator Atemzugvolumen',
      unit: 'kg',
      usage: {
        when: 'Invasive Beatmung – bei ARDS, aber auch allgemein bei Intensiv- und Notfallpatienten: das Tidalvolumen nach dem Idealgewicht einstellen, das nur von Körpergröße und Geschlecht abhängt.',
        not: 'Formel für Erwachsene, nicht für Kinder. Nicht das tatsächliche Körpergewicht verwenden – bei Adipositas führt das zu deutlich zu großen Atemzugvolumina.',
      },
      items: [
        num('height', 'Körpergröße', [unit('cm', 1, 0)], 130, 230, SHARED('height')),
        SEX('sex'),
      ],
      max: null,
      compute(a) {
        return Math.round(((a.sex.key === 'm' ? 50 : 45.5) + 0.91 * (a.height - 152.4)) * 10) / 10;
      },
      interpret(total) {
        const vt = (ml) => ({ name: `${ml} ml/kg`, value: `${formatNumber(Math.round(total * ml / 10) * 10, 0)} ml`, note: ml === 6 ? 'Zielwert bei lungenprotektiver Beatmung' : ml === 4 ? 'untere Grenze' : 'obere Grenze', level: 'info' });
        return {
          level: 'info',
          label: `Idealgewicht ${formatPoints(total)} kg`,
          rows: [vt(6), vt(4), vt(8)],
          text: 'Lungenprotektive Beatmung: Tidalvolumen 6 ml/kg Idealgewicht (Bereich 4–8 ml/kg), Plateaudruck höchstens 30 cmH₂O.',
        };
      },
      notes: [
        'Idealgewicht (ARDS Network): Männer 50 + 0,91 × (Größe in cm − 152,4), Frauen 45,5 + 0,91 × (Größe in cm − 152,4) kg.',
      ],
      sources: [
        { label: 'The Acute Respiratory Distress Syndrome Network. Ventilation with lower tidal volumes as compared with traditional tidal volumes for acute lung injury and the acute respiratory distress syndrome. N Engl J Med 2000;342(18):1301–1308', url: 'https://doi.org/10.1056/NEJM200005043421801' },
      ],
    },

    {
      id: 'ct-head',
      group: 'Trauma',
      short: 'CT Head',
      title: 'Canadian CT Head Rule',
      subtitle: 'Leichtes Schädel-Hirn-Trauma: Ist ein CT des Schädels nötig?',
      keywords: 'Schädel-Hirn-Trauma SHT Kopfverletzung CCT cCT Bildgebung Commotio Gehirnerschütterung',
      rule: true,
      usage: {
        when: 'Erwachsene ab 16 Jahren mit leichtem Schädel-Hirn-Trauma: GCS 13–15 und beobachtete Bewusstlosigkeit, eindeutige Amnesie oder beobachtete Desorientierung. Liegt keines der Kriterien vor, ist ein CT nach der Regel nicht erforderlich.',
        not: 'Nicht anwendbar bei Antikoagulation oder Gerinnungsstörung, Krampfanfall nach dem Trauma, offensichtlicher offener Schädelverletzung, instabilen Vitalparametern, Schwangerschaft, fokal-neurologischem Defizit, Wiedervorstellung wegen desselben Traumas oder Alter unter 16 Jahren – dort großzügig CT.',
      },
      items: [
        heading('Hohes Risiko (neurochirurgische Intervention)'),
        flag('gcs2h', 'GCS < 15 zwei Stunden nach dem Trauma'),
        flag('fx', 'Verdacht auf offene oder Impressionsfraktur des Schädels'),
        flag('basal', 'Zeichen einer Schädelbasisfraktur', 'Hämatotympanon, Brillen- oder Monokelhämatom, Oto- oder Rhinoliquorrhö, Battle-Zeichen'),
        flag('vomit', 'Erbrechen ≥ 2 ×'),
        flag('age', 'Alter ≥ 65 Jahre'),
        heading('Mittleres Risiko (relevanter Befund im CT)'),
        flag('amnesia', 'Amnesie für ≥ 30 Minuten vor dem Aufprall'),
        flag('mech', 'Gefährlicher Unfallmechanismus', 'Fußgänger von Fahrzeug erfasst, aus Fahrzeug geschleudert, Sturz aus > 1 m oder mehr als 5 Stufen'),
      ],
      max: null,
      compute(a) {
        return ['gcs2h', 'fx', 'basal', 'vomit', 'age', 'amnesia', 'mech'].filter((k) => a[k]).length;
      },
      interpret(total, a) {
        if (a.gcs2h || a.fx || a.basal || a.vomit || a.age) return { level: 'high', label: 'CT indiziert', text: 'Hohes Risiko für eine neurochirurgisch relevante Verletzung. CT des Schädels.' };
        if (a.amnesia || a.mech) return { level: 'mid', label: 'CT indiziert', text: 'Mittleres Risiko für einen relevanten Befund im CT. CT des Schädels.' };
        return { level: 'low', label: 'Kein CT nach der Regel', text: 'Keines der Kriterien erfüllt – ein CT ist nach der Canadian CT Head Rule nicht erforderlich. Aufklärung über Warnzeichen und Wiedervorstellung.' };
      },
      notes: [
        'In der Ableitungsstudie erkannten die Hochrisiko-Kriterien alle Patienten mit neurochirurgischer Intervention (Sensitivität 100 %).',
      ],
      related: [
        { id: 'gcs', text: 'Bewusstseinslage mit der GCS dokumentieren' },
        { id: 'c-spine', text: 'Begleitende HWS-Verletzung? Canadian C-Spine Rule' },
      ],
      sources: [
        { label: 'Stiell IG et al. The Canadian CT Head Rule for patients with minor head injury. Lancet 2001;357(9266):1391–1396', url: 'https://doi.org/10.1016/S0140-6736(00)04561-X' },
      ],
    },

    {
      id: 'c-spine',
      group: 'Trauma',
      short: 'C-Spine',
      title: 'Canadian C-Spine Rule',
      subtitle: 'Halswirbelsäule nach Trauma: Ist eine Bildgebung nötig?',
      keywords: 'HWS Halswirbelsäule Wirbelsäule Nacken Schleudertrauma Beschleunigungstrauma Bildgebung CT Röntgen',
      rule: true,
      usage: {
        when: 'Wache (GCS 15), kreislaufstabile Erwachsene nach Trauma mit Nackenschmerzen oder möglicher HWS-Verletzung – entscheiden, ob eine Bildgebung der Halswirbelsäule nötig ist. Die drei Schritte nacheinander prüfen.',
        not: 'Nicht anwendbar bei Alter unter 16 Jahren, GCS < 15, instabilen Vitalparametern, penetrierendem Trauma, akuter Lähmung, bekannter Wirbelsäulenerkrankung (Morbus Bechterew, rheumatoide Arthritis, Spinalkanalstenose), früherer HWS-Operation, Schwangerschaft oder Trauma vor mehr als 48 Stunden.',
      },
      items: [
        heading('1 · Hochrisiko-Faktoren'),
        flag('age', 'Alter ≥ 65 Jahre'),
        flag('mech', 'Gefährlicher Unfallmechanismus', 'Sturz aus ≥ 1 m oder ≥ 5 Stufen, axiale Stauchung (z. B. Kopfsprung), Verkehrsunfall mit hoher Geschwindigkeit (> 100 km/h), Überschlag oder Herausschleudern, Unfall mit motorisiertem Freizeitfahrzeug, Fahrradkollision'),
        flag('par', 'Parästhesien in den Extremitäten'),
        heading('2 · Niedrigrisiko-Faktoren'),
        flag('rear', 'Einfacher Auffahrunfall', 'nicht: in den Gegenverkehr geschoben, Zusammenstoß mit Bus oder Lkw, Überschlag, Aufprall mit hoher Geschwindigkeit'),
        flag('sit', 'Sitzt in der Notaufnahme'),
        flag('walk', 'War seit dem Unfall zu irgendeinem Zeitpunkt gehfähig'),
        flag('delay', 'Nackenschmerz erst verzögert aufgetreten'),
        flag('notender', 'Kein Druckschmerz über der HWS-Mittellinie'),
        heading('3 · Bewegungsprüfung'),
        flag('rot', 'Kann den Kopf aktiv 45° nach links und rechts drehen', 'nur prüfen, wenn kein Hochrisiko- und mindestens ein Niedrigrisiko-Faktor vorliegt'),
      ],
      max: null,
      compute(a) {
        return ['age', 'mech', 'par'].filter((k) => a[k]).length;
      },
      interpret(total, a) {
        if (total > 0) return { level: 'high', label: 'Bildgebung empfohlen', text: 'Hochrisiko-Faktor vorhanden – Bildgebung der HWS, die Bewegung nicht prüfen.' };
        if (!(a.rear || a.sit || a.walk || a.delay || a.notender)) return { level: 'high', label: 'Bildgebung empfohlen', text: 'Kein Niedrigrisiko-Faktor – die Beweglichkeit darf nicht geprüft werden. Bildgebung der HWS.' };
        if (!a.rot) return { level: 'high', label: 'Bildgebung empfohlen', text: 'Aktive Rotation um 45° nach beiden Seiten nicht möglich (oder nicht geprüft). Bildgebung der HWS.' };
        return { level: 'low', label: 'Keine Bildgebung nötig', text: 'Kein Hochrisiko-Faktor, mindestens ein Niedrigrisiko-Faktor und freie aktive Rotation – nach der Canadian C-Spine Rule ist keine Bildgebung erforderlich.' };
      },
      notes: [
        'Bei Erwachsenen ist das CT in der Regel die Bildgebung der Wahl.',
        'In der direkten Vergleichsstudie war die Canadian C-Spine Rule sensitiver als NEXUS (99,4 % gegenüber 90,7 %).',
      ],
      related: [
        { id: 'nexus', text: 'Alternative: NEXUS-Kriterien' },
      ],
      sources: [
        { label: 'Stiell IG et al. The Canadian C-spine rule for radiography in alert and stable trauma patients. JAMA 2001;286(15):1841–1848', url: 'https://doi.org/10.1001/jama.286.15.1841' },
        { label: 'Stiell IG et al. The Canadian C-spine rule versus the NEXUS low-risk criteria in patients with trauma. N Engl J Med 2003;349(26):2510–2518', url: 'https://doi.org/10.1056/NEJMoa031375' },
      ],
    },

    {
      id: 'nexus',
      group: 'Trauma',
      short: 'NEXUS',
      title: 'NEXUS-Kriterien',
      subtitle: 'Halswirbelsäule nach Trauma: Bildgebung, wenn eines der fünf Kriterien vorliegt',
      keywords: 'HWS Halswirbelsäule Wirbelsäule Nacken Bildgebung Röntgen CT National Emergency X-Radiography Utilization Study',
      rule: true,
      usage: {
        when: 'Patienten nach stumpfem Trauma mit möglicher HWS-Verletzung. Ist keines der fünf Kriterien erfüllt, kann auf eine Bildgebung verzichtet werden. Auch bei Kindern und älteren Patienten untersucht.',
        not: 'Bei Erwachsenen ist die Canadian C-Spine Rule sensitiver und spezifischer. Nicht bei penetrierendem Trauma. Eine Bewusstseinsstörung oder Intoxikation erlaubt keine verlässliche Untersuchung.',
      },
      items: [
        flag('tender', 'Druckschmerz über der HWS-Mittellinie'),
        flag('neuro', 'Fokal-neurologisches Defizit'),
        flag('alert', 'Bewusstseinsstörung', 'GCS < 15, Desorientierung, verzögerte Reaktion, Amnesie'),
        flag('intox', 'Hinweis auf Intoxikation'),
        flag('distract', 'Ablenkende, schmerzhafte Begleitverletzung', 'z. B. Frakturen langer Röhrenknochen, große Wunden, Verbrennungen'),
      ],
      max: null,
      compute(a) {
        return ['tender', 'neuro', 'alert', 'intox', 'distract'].filter((k) => a[k]).length;
      },
      interpret(total) {
        if (total > 0) return { level: 'high', label: 'Bildgebung empfohlen', text: 'Mindestens ein NEXUS-Kriterium erfüllt – Bildgebung der HWS.' };
        return { level: 'low', label: 'Keine Bildgebung nötig', text: 'Keines der fünf Kriterien erfüllt – nach NEXUS ist keine Bildgebung erforderlich (Sensitivität in der Validierung 99,6 %).' };
      },
      related: [
        { id: 'c-spine', text: 'Bei Erwachsenen: Canadian C-Spine Rule' },
      ],
      sources: [
        { label: 'Hoffman JR et al. Validity of a set of clinical criteria to rule out injury to the cervical spine in patients with blunt trauma. N Engl J Med 2000;343(2):94–99', url: 'https://doi.org/10.1056/NEJM200007133430203' },
      ],
    },

    {
      id: 'ottawa-ankle',
      group: 'Trauma',
      short: 'Ottawa Ankle',
      title: 'Ottawa Ankle Rules',
      subtitle: 'Sprunggelenk- und Mittelfußtrauma: Ist ein Röntgenbild nötig?',
      keywords: 'Sprunggelenk OSG Knöchel Umknicktrauma Supinationstrauma Distorsion Mittelfuß Fuß Röntgen Fraktur',
      rule: true,
      usage: {
        when: 'Erwachsene mit akutem Umknick- oder Sprunggelenktrauma: entscheiden, ob ein Röntgenbild von Sprunggelenk oder Fuß nötig ist. Die Sensitivität für relevante Frakturen liegt nahe 100 %.',
        not: 'Nicht anwendbar bei Intoxikation, Mehrfachverletzung, eingeschränkter Sensibilität, Schwangerschaft, Verletzung älter als 10 Tage oder Wiedervorstellung. Bei Kindern nur eingeschränkt validiert.',
      },
      items: [
        heading('Sprunggelenk'),
        flag('mall', 'Schmerz im Bereich der Knöchel (Malleolen)'),
        flag('lat', 'Druckschmerz an Hinterkante oder Spitze des Außenknöchels', 'distale 6 cm'),
        flag('med', 'Druckschmerz an Hinterkante oder Spitze des Innenknöchels', 'distale 6 cm'),
        heading('Mittelfuß'),
        flag('mid', 'Schmerz im Mittelfußbereich'),
        flag('mt5', 'Druckschmerz an der Basis des 5. Mittelfußknochens'),
        flag('nav', 'Druckschmerz über dem Os naviculare'),
        heading('Belastung'),
        flag('nwb', 'Belastung nicht möglich', 'weder direkt nach dem Unfall noch in der Notaufnahme 4 Schritte (Hinken zählt als Schritt)'),
      ],
      max: null,
      compute(a) {
        return ['mall', 'lat', 'med', 'mid', 'mt5', 'nav', 'nwb'].filter((k) => a[k]).length;
      },
      interpret(total, a) {
        const ankle = a.mall && (a.lat || a.med || a.nwb);
        const foot = a.mid && (a.mt5 || a.nav || a.nwb);
        if (ankle && foot) return { level: 'high', label: 'Röntgen Sprunggelenk und Fuß', text: 'Kriterien für beide Regionen erfüllt.' };
        if (ankle) return { level: 'high', label: 'Röntgen Sprunggelenk', text: 'Schmerz im Knöchelbereich mit Druckschmerz an typischer Stelle oder fehlender Belastbarkeit.' };
        if (foot) return { level: 'high', label: 'Röntgen Fuß', text: 'Schmerz im Mittelfußbereich mit Druckschmerz an typischer Stelle oder fehlender Belastbarkeit.' };
        if (!a.mall && !a.mid) return { level: 'mid', label: 'Regel nicht anwendbar', text: 'Kein Schmerz im Knöchel- oder Mittelfußbereich angegeben – die Ottawa-Regeln greifen nur bei Schmerzen in diesen Zonen. Klinisch entscheiden.' };
        return { level: 'low', label: 'Kein Röntgen nötig', text: 'Nach den Ottawa Ankle Rules ist kein Röntgenbild erforderlich. Wiedervorstellung bei anhaltenden Schmerzen oder fehlender Belastbarkeit nach etwa einer Woche.' };
      },
      related: [
        { id: 'ottawa-knee', text: 'Knie mitbetroffen? Ottawa Knee Rule' },
      ],
      sources: [
        { label: 'Stiell IG et al. A study to develop clinical decision rules for the use of radiography in acute ankle injuries. Ann Emerg Med 1992;21(4):384–390', url: 'https://doi.org/10.1016/S0196-0644(05)82656-3' },
        { label: 'Stiell IG et al. Decision rules for the use of radiography in acute ankle injuries. Refinement and prospective validation. JAMA 1993;269(9):1127–1132', url: 'https://doi.org/10.1001/jama.1993.03500090063034' },
      ],
    },

    {
      id: 'ottawa-knee',
      group: 'Trauma',
      short: 'Ottawa Knee',
      title: 'Ottawa Knee Rule',
      subtitle: 'Akutes Knietrauma: Ist ein Röntgenbild nötig?',
      keywords: 'Knie Kniegelenk Knietrauma Patella Fibulaköpfchen Röntgen Fraktur',
      rule: true,
      usage: {
        when: 'Erwachsene mit akutem Knietrauma: entscheiden, ob ein Röntgenbild nötig ist. Ein Röntgenbild ist angezeigt, wenn mindestens eines der Kriterien vorliegt.',
        not: 'Nicht anwendbar bei Intoxikation, Mehrfachverletzung, eingeschränkter Sensibilität, isolierten Hautverletzungen, Verletzung älter als 7 Tage oder Wiedervorstellung. Bei Kindern und Jugendlichen nur eingeschränkt validiert.',
      },
      items: [
        flag('age', 'Alter ≥ 55 Jahre'),
        flag('patella', 'Isolierter Druckschmerz der Patella', 'kein anderer knöcherner Druckschmerz am Knie'),
        flag('fibula', 'Druckschmerz am Fibulaköpfchen'),
        flag('flex', 'Beugung bis 90° nicht möglich'),
        flag('nwb', 'Belastung nicht möglich', 'weder direkt nach dem Unfall noch in der Notaufnahme 4 Schritte (Hinken zählt als Schritt)'),
      ],
      max: null,
      compute(a) {
        return ['age', 'patella', 'fibula', 'flex', 'nwb'].filter((k) => a[k]).length;
      },
      interpret(total) {
        if (total > 0) return { level: 'high', label: 'Röntgen Knie', text: 'Mindestens ein Kriterium der Ottawa Knee Rule erfüllt.' };
        return { level: 'low', label: 'Kein Röntgen nötig', text: 'Keines der Kriterien erfüllt – nach der Ottawa Knee Rule ist kein Röntgenbild erforderlich.' };
      },
      related: [
        { id: 'ottawa-ankle', text: 'Sprunggelenk mitbetroffen? Ottawa Ankle Rules' },
      ],
      sources: [
        { label: 'Stiell IG et al. Derivation of a decision rule for the use of radiography in acute knee injuries. Ann Emerg Med 1995;26(4):405–413', url: 'https://doi.org/10.1016/S0196-0644(95)70106-0' },
        { label: 'Stiell IG et al. Prospective validation of a decision rule for the use of radiography in acute knee injuries. JAMA 1996;275(8):611–615', url: 'https://doi.org/10.1001/jama.1996.03530320035031' },
      ],
    },

    {
      id: 'parkland',
      group: 'Trauma',
      short: 'Parkland',
      title: 'Parkland-Formel',
      subtitle: 'Verbrennungen: Flüssigkeitsbedarf in den ersten 24 Stunden',
      keywords: 'Verbrennung Verbrühung Baxter Infusion Ringer VKOF Neunerregel Brandverletzung',
      unit: 'ml / 24 h',
      usage: {
        when: 'Erwachsene mit zweit- und drittgradigen Verbrennungen ab etwa 15–20 % VKOF: Startwert für die Infusion von Vollelektrolytlösung (z. B. Ringer-Laktat) in den ersten 24 Stunden, gerechnet ab dem Zeitpunkt der Verbrennung.',
        not: 'Erstgradige Verbrennungen nicht mitzählen. Die Formel ist nur ein Startwert: Steuerung nach Urinausscheidung (Erwachsene 0,5 ml/kg/h) und Kreislauf. Überinfusion („fluid creep“) vermeiden – viele Zentren starten heute mit 2–4 ml/kg/% VKOF. Bei Kindern zusätzlich Erhaltungsbedarf und pädiatrische Formeln beachten.',
      },
      items: [
        num('weight', 'Körpergewicht', KG, 1, 300, SHARED('weight')),
        num('vkof', 'Verbrannte Körperoberfläche', [unit('% VKOF', 1, 0)], 1, 100, { hint: 'nur 2. und 3. Grad. Neunerregel: Kopf 9 %, je Arm 9 %, Rumpf vorn 18 %, hinten 18 %, je Bein 18 %, Genitale 1 %; Handfläche des Patienten mit Fingern ≈ 1 %' }),
        num('hours', 'Zeit seit der Verbrennung', [unit('h', 1, 1)], 0, 24, { optional: true, hint: 'für die Laufrate, wenn die Infusion verspätet beginnt' }),
      ],
      max: null,
      compute(a) {
        return Math.round(4 * a.weight * a.vkof);
      },
      interpret(total, a) {
        const half = total / 2;
        const ml = (v) => `${formatNumber(v, 0)} ml`;
        const rate = (v) => `${formatNumber(v, 0)} ml/h`;
        const rows = [];
        if (a.hours !== undefined && a.hours < 8) {
          rows.push({ name: `Bis Stunde 8 (noch ${formatNumber(8 - a.hours, 1)} h)`, value: rate(half / (8 - a.hours)), note: `${ml(half)}, falls bisher keine Infusion gelaufen ist`, level: 'info' });
        } else {
          rows.push({ name: 'Stunde 0–8', value: rate(half / 8), note: ml(half), level: 'info' });
        }
        rows.push({ name: 'Stunde 8–24', value: rate(half / 16), note: ml(half), level: 'info' });
        rows.push({ name: 'Ziel-Urinausscheidung', value: rate(a.weight * 0.5), note: '0,5 ml/kg/h (Erwachsene)', level: 'info' });
        const late = a.hours !== undefined && a.hours >= 8
          ? ' Die ersten 8 Stunden sind bereits vorbei – bisher gegebene Mengen anrechnen und an Diurese und Kreislauf ausrichten.'
          : '';
        const level = a.vkof >= 40 ? 'high' : a.vkof >= 15 ? 'mid' : 'low';
        const label = a.vkof >= 15 ? `${formatNumber(a.vkof, 0)} % VKOF` : 'Unter 15 % VKOF';
        const hint = a.vkof < 15 ? 'Bei Erwachsenen ist unter etwa 15 % VKOF meist keine formelbasierte Infusion nötig. ' : '';
        return { level, label, rows, text: `${hint}4 ml × ${formatNumber(a.weight, 1)} kg × ${formatNumber(a.vkof, 0)} % = ${ml(total)} in 24 Stunden; die Hälfte in den ersten 8 Stunden ab Verbrennung.${late} Verlegung in ein Zentrum für Schwerbrandverletzte prüfen.` };
      },
      notes: [
        'Die modifizierte Brooke-Formel rechnet mit 2 ml/kg/% VKOF.',
      ],
      sources: [
        { label: 'Baxter CR, Shires T. Physiological response to crystalloid resuscitation of severe burns. Ann N Y Acad Sci 1968;150(3):874–894', url: 'https://doi.org/10.1111/j.1749-6632.1968.tb14738.x' },
      ],
    },

    {
      id: 'curb65',
      group: 'Infektionen',
      short: 'CURB-65',
      title: 'CURB-65',
      subtitle: 'Ambulant erworbene Pneumonie: Schweregrad und Behandlungsort',
      keywords: 'Pneumonie Lungenentzündung CRB-65 CAP',
      usage: {
        when: 'Erwachsene mit ambulant erworbener Pneumonie bei Erstvorstellung – Abschätzung der 30-Tage-Letalität und Entscheidung zwischen ambulanter und stationärer Behandlung. Ohne Labor als CRB-65 (Hausarztpraxis, Notaufnahme).',
        not: 'Nicht für nosokomiale Pneumonie oder schwer immunsupprimierte Patienten. Ersetzt nicht die Beurteilung von Oxygenierung, Komorbidität, Funktionsstatus und sozialer Situation.',
      },
      items: [
        bool('c', 'Neu aufgetretene Verwirrtheit', 1, 'Desorientierung zu Person, Ort oder Zeit'),
        choice('u', 'Harnstoff', [
          opt(0, '≤ 7 mmol/l'),
          opt(1, '> 7 mmol/l', { hint: '> 42 mg/dl Harnstoff · BUN > 19 mg/dl' }),
          opt(0, 'nicht bestimmt', { key: 'unknown', hint: 'rechnet als CRB-65' }),
        ]),
        bool('r', 'Atemfrequenz ≥ 30/min', 1),
        bool('b', 'Blutdruck systolisch < 90 oder diastolisch ≤ 60 mmHg', 1),
        bool('a', 'Alter ≥ 65 Jahre', 1),
      ],
      interpret(total, chosen) {
        if (chosen.u && chosen.u.key === 'unknown') {
          const base = { scoreName: 'CRB-65', max: 4 };
          if (total === 0) return Object.assign(base, { level: 'low', label: 'Niedriges Risiko', text: 'Ambulante Behandlung meist möglich, sofern Oxygenierung, Begleiterkrankungen und soziales Umfeld nicht dagegen sprechen.' });
          if (total <= 2) return Object.assign(base, { level: 'mid', label: 'Mittleres Risiko', text: 'Stationäre Behandlung erwägen.' });
          return Object.assign(base, { level: 'high', label: 'Hohes Risiko', text: 'Dringliche stationäre Aufnahme; Intensivstation prüfen.' });
        }
        if (total <= 1) return { level: 'low', label: 'Niedriges Risiko', text: '30-Tage-Letalität in der Ableitungskohorte 1,5 %. Ambulante Behandlung meist möglich.' };
        if (total === 2) return { level: 'mid', label: 'Mittleres Risiko', text: '30-Tage-Letalität in der Ableitungskohorte 9,2 %. Kurze stationäre oder engmaschig überwachte ambulante Behandlung.' };
        return { level: 'high', label: 'Hohes Risiko', text: '30-Tage-Letalität in der Ableitungskohorte 22 %. Stationäre Behandlung; bei 4–5 Punkten Intensivstation erwägen.' };
      },
      notes: [
        'Die deutsche S3-Leitlinie verwendet CRB-65 (ohne Harnstoff), ergänzt um Oxygenierung, Komorbidität und Funktionsstatus.',
      ],
      related: [
        { id: 'legionella', text: 'Legionellen-Wahrscheinlichkeit abschätzen' },
      ],
      sources: [
        { label: 'Lim WS et al. Defining community acquired pneumonia severity on presentation to hospital. Thorax 2003;58:377–382', url: 'https://doi.org/10.1136/thorax.58.5.377' },
      ],
    },

    {
      id: 'centor',
      group: 'Infektionen',
      short: 'McIsaac',
      title: 'Centor-/McIsaac-Score',
      subtitle: 'Akute Halsschmerzen: Wahrscheinlichkeit einer Streptokokken-A-Tonsillopharyngitis',
      keywords: 'Centor Halsschmerzen Tonsillitis Pharyngitis Angina Streptokokken Antibiotikum',
      usage: {
        when: 'Patienten ab 3 Jahren mit akuten Halsschmerzen – abschätzen, wie wahrscheinlich eine Infektion mit A-Streptokokken ist, und danach über Schnelltest und Antibiotikum entscheiden. Ohne die Alterskorrektur entspricht der Score dem ursprünglichen Centor-Score (Erwachsene).',
        not: 'Nicht bei Kindern unter 3 Jahren, Immunsuppression, Verdacht auf Peritonsillarabszess, Scharlach mit Exanthem oder schwerem Krankheitsbild – dort unabhängig vom Score handeln.',
      },
      items: [
        bool('temp', 'Fieber > 38 °C', 1, 'gemessen oder anamnestisch'),
        bool('cough', 'Kein Husten', 1),
        bool('lk', 'Geschwollene, druckschmerzhafte vordere Halslymphknoten', 1),
        bool('tons', 'Tonsillenschwellung oder -exsudat', 1),
        choice('age', 'Alter (McIsaac-Korrektur)', [
          opt(1, '3–14 Jahre'),
          opt(0, '15–44 Jahre'),
          opt(-1, '≥ 45 Jahre'),
        ]),
      ],
      interpret(total) {
        if (total <= 0) return { level: 'low', label: 'Sehr niedrige Wahrscheinlichkeit', text: 'Streptokokken-A-Nachweis in der Studie 1–2,5 %. Kein Test, kein Antibiotikum.' };
        if (total === 1) return { level: 'low', label: 'Niedrige Wahrscheinlichkeit', text: 'Streptokokken-A-Nachweis in der Studie 5–10 %. Kein Test, kein Antibiotikum.' };
        if (total === 2) return { level: 'mid', label: 'Mittlere Wahrscheinlichkeit', text: 'Streptokokken-A-Nachweis in der Studie 11–17 %. In der Regel kein Antibiotikum; ein Schnelltest kann die Entscheidung stützen.' };
        if (total === 3) return { level: 'mid', label: 'Mittlere Wahrscheinlichkeit', text: 'Streptokokken-A-Nachweis in der Studie 28–35 %. Schnelltest erwägen; bei positivem Test oder in gemeinsamer Entscheidung Antibiotikum (ggf. verzögerte Verordnung).' };
        return { level: 'high', label: 'Hohe Wahrscheinlichkeit', text: 'Streptokokken-A-Nachweis in der Studie 51–53 %. Antibiotikatherapie erwägen (Mittel der Wahl Penicillin V); ein Schnelltest kann die Entscheidung stützen.' };
      },
      notes: [
        'Die DEGAM-Leitlinie „Halsschmerzen“ empfiehlt eine Antibiotikatherapie erst ab 3 Punkten zu erwägen; der Nutzen ist auch dann begrenzt (Symptomdauer etwa 1 Tag kürzer).',
        'Bei Kindern ist eine asymptomatische Besiedlung mit A-Streptokokken häufig – ein positiver Test beweist keine Infektion.',
      ],
      sources: [
        { label: 'McIsaac WJ et al. A clinical score to reduce unnecessary antibiotic use in patients with sore throat. CMAJ 1998;158(1):75–83', url: 'https://pubmed.ncbi.nlm.nih.gov/9475915/' },
        { label: 'Centor RM et al. The diagnosis of strep throat in adults in the emergency room. Med Decis Making 1981;1(3):239–246', url: 'https://doi.org/10.1177/0272989X8100100304' },
      ],
    },

    {
      id: 'legionella',
      group: 'Infektionen',
      short: 'Legionellen',
      title: 'Legionella-Score',
      subtitle: 'Ambulant erworbene Pneumonie: Wahrscheinlichkeit einer Legionellen-Infektion',
      keywords: 'Legionellen Legionella Legionärskrankheit Pneumonie CAP Urin-Antigen Makrolid Fiumefreddo',
      usage: {
        when: 'Erwachsene mit ambulant erworbener Pneumonie in der Notaufnahme – abschätzen, wie wahrscheinlich Legionellen sind. Vor allem ein niedriger Score hilft, eine Legionellose auszuschließen und auf gezielte Diagnostik und Legionellen-wirksame Therapie zu verzichten.',
        not: 'Nicht bei nosokomialer Pneumonie oder schwerer Immunsuppression untersucht. Ersetzt nicht den Urin-Antigentest bzw. die PCR. Bei schwerer Pneumonie, Ausbruchsgeschehen oder typischer Exposition (Reise mit Hotelaufenthalt, Whirlpool, Kühltürme) unabhängig vom Score auf Legionellen testen.',
      },
      items: [
        bool('temp', 'Körpertemperatur > 39,4 °C', 1),
        bool('sputum', 'Kein Auswurf', 1),
        bool('na', 'Natrium < 133 mmol/l', 1),
        bool('ldh', 'LDH > 225 U/l', 1),
        bool('crp', 'CRP > 187 mg/l', 1, '= 18,7 mg/dl'),
        bool('plt', 'Thrombozyten < 171/nl', 1, '/nl = 10³/µl'),
      ],
      interpret(total) {
        if (total <= 1) return { level: 'low', label: 'Legionellen sehr unwahrscheinlich', text: 'In der Validierungsstudie lag der negative prädiktive Wert für weniger als 2 Punkte bei etwa 99 %. Gezielte Legionellen-Diagnostik meist entbehrlich, sofern keine Exposition, kein Ausbruch und kein schwerer Verlauf vorliegen.' };
        if (total <= 3) return { level: 'mid', label: 'Mittlere Wahrscheinlichkeit', text: 'Legionellen nicht ausgeschlossen. Urin-Antigentest erwägen; bei positivem Befund Legionellen-wirksame Therapie (Makrolid oder Fluorchinolon).' };
        return { level: 'high', label: 'Hohe Wahrscheinlichkeit', text: 'Legionellen-Diagnostik (Urin-Antigentest, ggf. PCR aus Atemwegsmaterial) und eine Legionellen-wirksame Therapie (Makrolid oder Fluorchinolon) erwägen.' };
      },
      notes: [
        'Abgeleitet und validiert an Patienten mit ambulant erworbener Pneumonie in Schweizer Notaufnahmen.',
        'Der Urin-Antigentest erfasst nur Legionella pneumophila Serogruppe 1; ein negativer Test schließt andere Serogruppen nicht aus.',
      ],
      related: [
        { id: 'curb65', text: 'Schweregrad der Pneumonie mit CURB-65' },
      ],
      sources: [
        { label: 'Fiumefreddo R et al. Clinical predictors for Legionella in patients presenting with community-acquired pneumonia to the emergency department. BMC Pulm Med 2009;9:4', url: 'https://doi.org/10.1186/1471-2466-9-4' },
        { label: 'Haubitz S et al. Ruling out Legionella in community-acquired pneumonia. Am J Med 2014;127(10):1010.e11–1010.e19', url: 'https://doi.org/10.1016/j.amjmed.2014.03.042' },
      ],
    },

    {
      id: 'heart',
      group: 'Kardiologie',
      short: 'HEART',
      title: 'HEART-Score',
      subtitle: 'Brustschmerz in der Notaufnahme: Risiko für ein schweres kardiales Ereignis (MACE) in 6 Wochen',
      keywords: 'Brustschmerz Thoraxschmerz ACS Herzinfarkt NSTEMI Troponin',
      usage: {
        when: 'Erwachsene mit akutem Brustschmerz in der Notaufnahme, bei denen ein akutes Koronarsyndrom in Frage kommt – Risikostratifizierung für MACE in 6 Wochen und Entscheidung über frühe Entlassung.',
        not: 'Nicht bei STEMI, hämodynamischer Instabilität oder eindeutig nicht-kardialer Ursache. Ersetzt nicht die Troponin-Algorithmen der ESC (0/1 h, 0/2 h).',
      },
      items: [
        choice('h', 'Anamnese', [
          opt(0, 'Wenig verdächtig'),
          opt(1, 'Mäßig verdächtig'),
          opt(2, 'Hoch verdächtig'),
        ]),
        choice('e', 'EKG', [
          opt(0, 'Normal'),
          opt(1, 'Unspezifische Repolarisationsstörung', { hint: 'auch Schenkelblock, LVH, Schrittmacher' }),
          opt(2, 'Signifikante ST-Abweichung'),
        ]),
        choice('a', 'Alter', [
          opt(0, '< 45 Jahre'),
          opt(1, '45–64 Jahre'),
          opt(2, '≥ 65 Jahre'),
        ]),
        choice('r', 'Risikofaktoren', [
          opt(0, 'Keine'),
          opt(1, '1–2 Risikofaktoren'),
          opt(2, '≥ 3 oder bekannte Atherosklerose', { hint: 'z. B. Z. n. Infarkt, PCI/CABG, Apoplex, pAVK' }),
        ], 'Hypercholesterinämie, Hypertonie, Diabetes, Rauchen (aktuell oder < 3 Monate), positive Familienanamnese, Adipositas (BMI > 30)'),
        choice('t', 'Troponin', [
          opt(0, '≤ Normgrenze'),
          opt(1, '1–3 × Normgrenze'),
          opt(2, '> 3 × Normgrenze'),
        ], 'Bezogen auf den lokalen Referenzwert (99. Perzentile)'),
      ],
      interpret(total) {
        if (total <= 3) return { level: 'low', label: 'Niedriges Risiko', text: 'MACE-Rate in 6 Wochen 1,7 % (Validierungsstudie). Frühe Entlassung mit ambulanter Abklärung vertretbar.' };
        if (total <= 6) return { level: 'mid', label: 'Mittleres Risiko', text: 'MACE-Rate in 6 Wochen 16,6 %. Stationäre Überwachung, serielle Troponinbestimmung, weiterführende Diagnostik.' };
        return { level: 'high', label: 'Hohes Risiko', text: 'MACE-Rate in 6 Wochen 50,1 %. Frühe invasive Abklärung.' };
      },
      sources: [
        { label: 'Six AJ, Backus BE, Kelder JC. Chest pain in the emergency room: value of the HEART score. Neth Heart J 2008;16(6):191–196', url: 'https://doi.org/10.1007/BF03086144' },
        { label: 'Backus BE et al. A prospective validation of the HEART score. Int J Cardiol 2013;168(3):2153–2158', url: 'https://doi.org/10.1016/j.ijcard.2013.01.255' },
      ],
    },

    {
      id: 'cha2ds2va',
      group: 'Kardiologie',
      short: 'CHA₂DS₂-VA',
      title: 'CHA₂DS₂-VA-Score',
      subtitle: 'Vorhofflimmern: Schlaganfallrisiko und Indikation zur Antikoagulation (ESC 2024)',
      keywords: 'CHA2DS2-VASc Vorhofflimmern VHF Vorhofflattern Antikoagulation Schlaganfall DOAK',
      usage: {
        when: 'Patienten mit Vorhofflimmern oder Vorhofflattern – Schlaganfallrisiko abschätzen und die Indikation zur oralen Antikoagulation stellen. Regelmäßig neu erheben, da sich das Risiko mit Alter und Begleiterkrankungen ändert.',
        not: 'Nicht bei mechanischer Herzklappe oder mittel- bis hochgradiger Mitralstenose (Antikoagulation mit Vitamin-K-Antagonist unabhängig vom Score) sowie bei hypertropher Kardiomyopathie und kardialer Amyloidose (Antikoagulation unabhängig vom Score empfohlen).',
      },
      items: [
        bool('chf', 'Herzinsuffizienz', 1, 'klinisch oder objektiv eingeschränkte LV-Funktion, unabhängig von der LVEF'),
        bool('htn', 'Arterielle Hypertonie', 1, 'oder antihypertensive Therapie'),
        choice('age', 'Alter', [
          opt(0, '< 65 Jahre'),
          opt(1, '65–74 Jahre'),
          opt(2, '≥ 75 Jahre'),
        ]),
        bool('dm', 'Diabetes mellitus', 1),
        bool('stroke', 'Schlaganfall, TIA oder arterielle Thromboembolie', 2, 'in der Vorgeschichte'),
        bool('vasc', 'Vaskuläre Erkrankung', 1, 'Z. n. Myokardinfarkt, KHK mit relevanten Stenosen, pAVK, komplexe Aortenplaques'),
      ],
      interpret(total) {
        if (total === 0) return { level: 'low', label: 'Keine Antikoagulation', text: 'Orale Antikoagulation nicht empfohlen. Risiko im Verlauf neu bewerten.' };
        if (total === 1) return { level: 'mid', label: 'Antikoagulation erwägen', text: 'Orale Antikoagulation sollte erwogen werden (ESC 2024, Empfehlungsgrad IIa). DOAK gegenüber Vitamin-K-Antagonisten bevorzugen.' };
        return { level: 'high', label: 'Antikoagulation empfohlen', text: 'Orale Antikoagulation empfohlen (ESC 2024, Empfehlungsgrad I). DOAK gegenüber Vitamin-K-Antagonisten bevorzugen.' };
      },
      notes: [
        'Seit den ESC-Leitlinien 2024 zählt das weibliche Geschlecht nicht mehr (CHA₂DS₂-VASc → CHA₂DS₂-VA).',
        'Das Blutungsrisiko (z. B. HAS-BLED) dient dazu, beeinflussbare Risikofaktoren zu behandeln – nicht dazu, eine indizierte Antikoagulation zu unterlassen.',
      ],
      related: [
        { id: 'hasbled', text: 'Beeinflussbare Blutungsrisiken mit HAS-BLED erkennen', when: (t) => t >= 1 },
      ],
      sources: [
        { label: 'Van Gelder IC et al. 2024 ESC Guidelines for the management of atrial fibrillation. Eur Heart J 2024;45(36):3314–3414', url: 'https://doi.org/10.1093/eurheartj/ehae176' },
      ],
    },

    {
      id: 'hasbled',
      group: 'Kardiologie',
      short: 'HAS-BLED',
      title: 'HAS-BLED-Score',
      subtitle: 'Blutungsrisiko unter oraler Antikoagulation bei Vorhofflimmern',
      keywords: 'Blutung Blutungsrisiko Antikoagulation Vorhofflimmern',
      usage: {
        when: 'Patienten mit Vorhofflimmern unter oder vor einer oralen Antikoagulation – Blutungsrisiko abschätzen und vor allem beeinflussbare Risikofaktoren (Blutdruck, Begleitmedikation, Alkohol, INR-Einstellung) erkennen.',
        not: 'Ein hoher Wert ist kein Grund, eine indizierte Antikoagulation vorzuenthalten: Die ESC 2024 rät ausdrücklich davon ab, Blutungsscores zur Entscheidung über Beginn oder Absetzen der Antikoagulation zu verwenden.',
      },
      items: [
        bool('h', 'Unkontrollierte Hypertonie', 1, 'systolisch > 160 mmHg'),
        bool('renal', 'Eingeschränkte Nierenfunktion', 1, 'Dialyse, Nierentransplantation oder Kreatinin ≥ 2,26 mg/dl (200 µmol/l)'),
        bool('liver', 'Eingeschränkte Leberfunktion', 1, 'Zirrhose oder Bilirubin > 2 × Normgrenze mit AST/ALT/AP > 3 × Normgrenze'),
        bool('stroke', 'Schlaganfall in der Vorgeschichte', 1),
        bool('bleed', 'Blutung in der Vorgeschichte oder Blutungsneigung', 1, 'z. B. Anämie, Thrombozytopenie'),
        bool('inr', 'Labiler INR', 1, 'nur unter Vitamin-K-Antagonist: Zeit im therapeutischen Bereich < 60 %'),
        bool('age', 'Alter > 65 Jahre', 1),
        bool('drugs', 'Thrombozytenaggregationshemmer oder NSAR', 1),
        bool('alc', 'Alkoholkonsum ≥ 8 Getränke pro Woche', 1),
      ],
      interpret(total) {
        const rates = ['1,13', '1,02', '1,88', '3,74', '8,70', '12,5'];
        const rate = total < rates.length
          ? `Schwere Blutungen in der Ableitungskohorte: ${rates[total]} pro 100 Patientenjahre.`
          : 'Für mehr als 5 Punkte liegen in der Ableitungskohorte keine ausreichenden Daten vor.';
        if (total <= 1) return { level: 'low', label: 'Niedriges Blutungsrisiko', text: rate };
        if (total === 2) return { level: 'mid', label: 'Mittleres Blutungsrisiko', text: `${rate} Beeinflussbare Risikofaktoren behandeln.` };
        return { level: 'high', label: 'Hohes Blutungsrisiko', text: `${rate} Beeinflussbare Risikofaktoren behandeln und engmaschiger kontrollieren – kein Grund, eine indizierte Antikoagulation zu unterlassen.` };
      },
      related: [
        { id: 'cha2ds2va', text: 'Schlaganfallrisiko mit CHA₂DS₂-VA' },
      ],
      sources: [
        { label: 'Pisters R et al. A novel user-friendly score (HAS-BLED) to assess 1-year risk of major bleeding in patients with atrial fibrillation. Chest 2010;138(5):1093–1100', url: 'https://doi.org/10.1378/chest.10-0134' },
        { label: 'Van Gelder IC et al. 2024 ESC Guidelines for the management of atrial fibrillation. Eur Heart J 2024;45(36):3314–3414', url: 'https://doi.org/10.1093/eurheartj/ehae176' },
      ],
    },

    {
      id: 'syncope',
      group: 'Kardiologie',
      short: 'Synkope',
      title: 'Canadian Syncope Risk Score',
      subtitle: 'Synkope in der Notaufnahme: Risiko für ein schwerwiegendes Ereignis in 30 Tagen',
      keywords: 'Synkope Kollaps Bewusstlosigkeit Ohnmacht CSRS Aufnahme Entlassung',
      usage: {
        when: 'Erwachsene, die sich nach einer Synkope in der Notaufnahme vorstellen: nach Anamnese, Untersuchung, EKG und Troponin das Risiko für schwerwiegende Ereignisse (Tod, Arrhythmie, Myokardinfarkt, relevante strukturelle Herzerkrankung u. a.) in den folgenden 30 Tagen abschätzen.',
        not: 'Nicht anwendbar bei anhaltender Bewusstseinsstörung, neuem neurologischem Defizit, Krampfanfall, Trauma als Ursache der Bewusstlosigkeit, Alter unter 16 Jahren oder wenn in der Notaufnahme bereits eine schwerwiegende Ursache gefunden wurde.',
      },
      items: [
        heading('Klinische Beurteilung'),
        bool('vaso', 'Prädisposition für vasovagale Symptome', -1, 'warme, volle Räume, langes Stehen, Angst, Emotion, Schmerz'),
        bool('heart', 'Herzerkrankung in der Vorgeschichte', 1, 'KHK, Vorhofflimmern oder -flattern, Herzinsuffizienz, Herzklappenerkrankung'),
        bool('bp', 'Systolischer Blutdruck < 90 oder > 180 mmHg', 2, 'irgendein Wert in der Notaufnahme'),
        heading('Untersuchungen'),
        bool('trop', 'Troponin erhöht', 2, 'über der 99. Perzentile'),
        bool('axis', 'Abnorme QRS-Achse', 1, '< −30° oder > 100°'),
        bool('qrs', 'QRS-Dauer > 130 ms', 1),
        bool('qtc', 'QTc > 480 ms', 2),
        heading('Diagnose in der Notaufnahme'),
        choice('dx', 'Arbeitsdiagnose', [
          opt(0, 'Unklar bzw. weder vasovagal noch kardial'),
          opt(-2, 'Vasovagale Synkope'),
          opt(2, 'Kardiale Synkope'),
        ]),
      ],
      interpret(total) {
        if (total <= -2) return { level: 'low', label: 'Sehr niedriges Risiko', text: 'Schwerwiegendes Ereignis in 30 Tagen in der Ableitungsstudie 0,4–0,7 %. Entlassung in der Regel möglich.' };
        if (total <= 0) return { level: 'low', label: 'Niedriges Risiko', text: 'Schwerwiegendes Ereignis in 30 Tagen in der Ableitungsstudie 1,2–1,9 %. Entlassung in der Regel möglich.' };
        if (total <= 3) return { level: 'mid', label: 'Mittleres Risiko', text: 'Schwerwiegendes Ereignis in 30 Tagen in der Ableitungsstudie 3,1–8,1 %. Weitere Abklärung, Monitorüberwachung erwägen.' };
        if (total <= 5) return { level: 'high', label: 'Hohes Risiko', text: 'Schwerwiegendes Ereignis in 30 Tagen in der Ableitungsstudie 12,9–19,7 %. Stationäre Aufnahme mit Monitorüberwachung erwägen.' };
        return { level: 'high', label: 'Sehr hohes Risiko', text: 'Schwerwiegendes Ereignis in 30 Tagen in der Ableitungsstudie 28,9–83,6 %. Stationäre Aufnahme mit Monitorüberwachung.' };
      },
      notes: [
        'Spannweite −3 bis 11 Punkte. Vasovagale und kardiale Synkope schließen sich als Arbeitsdiagnose aus.',
      ],
      related: [
        { id: 'heart', text: 'Brustschmerz dabei? HEART-Score' },
      ],
      sources: [
        { label: 'Thiruganasambandamoorthy V et al. Development of the Canadian Syncope Risk Score to predict serious adverse events after emergency department assessment of syncope. CMAJ 2016;188(12):E289–E298', url: 'https://doi.org/10.1503/cmaj.151469' },
      ],
    },

    {
      id: 'wells-le',
      group: 'Thrombose & Embolie',
      short: 'Wells LE',
      title: 'Wells-Score Lungenembolie',
      subtitle: 'Klinische Wahrscheinlichkeit einer Lungenembolie',
      keywords: 'Lungenembolie LE Lungenarterienembolie PE D-Dimer',
      usage: {
        when: 'Hämodynamisch stabile Patienten mit Verdacht auf Lungenembolie – Vortestwahrscheinlichkeit bestimmen, bevor D-Dimer oder CT-Pulmonalisangiographie angefordert werden. Bei schon klinisch niedriger Wahrscheinlichkeit vorab PERC prüfen.',
        not: 'Nicht bei hämodynamisch instabilen Patienten – dort direkt CT bzw. Echokardiographie. In der Schwangerschaft nur eingeschränkt validiert.',
      },
      items: [
        bool('dvt', 'Klinische Zeichen einer tiefen Venenthrombose', 3, 'Beinschwellung, Schmerz bei Palpation der tiefen Venen'),
        bool('alt', 'Lungenembolie wahrscheinlicher als andere Diagnosen', 3),
        bool('hr', 'Herzfrequenz > 100/min', 1.5),
        bool('immo', 'Immobilisation ≥ 3 Tage oder Operation in den letzten 4 Wochen', 1.5),
        bool('prev', 'Frühere TVT oder Lungenembolie', 1.5),
        bool('hemo', 'Hämoptyse', 1),
        bool('ca', 'Malignom', 1, 'aktive Therapie, Therapie in den letzten 6 Monaten oder palliativ'),
        num('age', 'Alter', YEARS, 1, 120, { optional: true, shared: 'age', hint: 'für den altersadjustierten D-Dimer-Grenzwert' }),
      ],
      interpret(total, a) {
        const tier = total < 2 ? 'niedrig' : total <= 6 ? 'mittel' : 'hoch';
        if (total <= 4) {
          const age = a.age !== undefined ? Math.floor(a.age) : null;
          const cutoff = age === null
            ? 'Ab 50 Jahren altersadjustierten Grenzwert verwenden (Alter × 10 µg/l FEU).'
            : age > 50
              ? `Altersadjustierter D-Dimer-Grenzwert für ${age} Jahre: ${age * 10} µg/l FEU (statt 500).`
              : 'D-Dimer-Grenzwert: 500 µg/l FEU.';
          return { level: 'low', label: 'LE unwahrscheinlich', text: `D-Dimer bestimmen; liegt es unter dem Grenzwert, ist eine Lungenembolie weitgehend ausgeschlossen, sonst CT-Pulmonalisangiographie. ${cutoff} Dreistufig: Wahrscheinlichkeit ${tier}.` };
        }
        return { level: 'high', label: 'LE wahrscheinlich', text: `CT-Pulmonalisangiographie; D-Dimer ist hier nicht zum Ausschluss geeignet. Dreistufig: Wahrscheinlichkeit ${tier}.` };
      },
      notes: [
        'Zweistufig: ≤ 4 unwahrscheinlich, > 4 wahrscheinlich. Dreistufig: < 2 niedrig, 2–6 mittel, > 6 hoch.',
        'Der altersadjustierte D-Dimer-Grenzwert (Alter × 10 µg/l FEU ab 50 Jahren) wurde für LE unwahrscheinlich bzw. nicht hoch validiert (ADJUST-PE). Einheiten und Referenzbereich des lokalen Tests beachten.',
      ],
      related: [
        { id: 'perc', text: 'Bei klinisch niedriger Wahrscheinlichkeit zuerst PERC prüfen', when: (t) => t <= 4 },
      ],
      sources: [
        { label: 'Wells PS et al. Derivation of a simple clinical model to categorize patients probability of pulmonary embolism: increasing the models utility with the SimpliRED D-dimer. Thromb Haemost 2000;83(3):416–420', url: 'https://doi.org/10.1055/s-0037-1613830' },
        { label: 'Righini M et al. Age-adjusted D-dimer cutoff levels to rule out pulmonary embolism: the ADJUST-PE study. JAMA 2014;311(11):1117–1124', url: 'https://doi.org/10.1001/jama.2014.2135' },
      ],
    },

    {
      id: 'perc',
      group: 'Thrombose & Embolie',
      short: 'PERC',
      title: 'PERC-Regel',
      subtitle: 'Pulmonary Embolism Rule-out Criteria: Lungenembolie ohne D-Dimer ausschließen',
      keywords: 'Lungenembolie LE D-Dimer Ausschluss',
      usage: {
        when: 'Patienten mit möglicher Lungenembolie, deren Vortestwahrscheinlichkeit der Arzt schon klinisch als niedrig (< 15 %) einschätzt, typischerweise in der Notaufnahme. Sind alle acht Kriterien negativ, kann auf D-Dimer und Bildgebung verzichtet werden.',
        not: 'Nicht bei mittlerer oder hoher klinischer Wahrscheinlichkeit, nicht in der Schwangerschaft. In Kollektiven mit höherer LE-Häufigkeit (z. B. stationäre Patienten) weniger zuverlässig.',
      },
      items: [
        bool('age', 'Alter ≥ 50 Jahre', 1),
        bool('hr', 'Herzfrequenz ≥ 100/min', 1),
        bool('spo2', 'SpO₂ < 95 % unter Raumluft', 1),
        bool('leg', 'Einseitige Beinschwellung', 1),
        bool('hemo', 'Hämoptyse', 1),
        bool('surg', 'Operation oder Trauma in den letzten 4 Wochen', 1, 'mit Allgemeinanästhesie bzw. stationärer Behandlung'),
        bool('prev', 'Frühere TVT oder Lungenembolie', 1),
        bool('hormone', 'Hormoneinnahme', 1, 'orale Kontrazeptiva, Hormonersatztherapie oder Östrogene'),
      ],
      interpret(total) {
        if (total === 0) return { level: 'low', label: 'PERC negativ', text: 'Bei niedriger klinischer Vortestwahrscheinlichkeit ist eine Lungenembolie ausreichend unwahrscheinlich (< 2 %); keine D-Dimer-Bestimmung nötig.' };
        return { level: 'mid', label: 'PERC positiv', text: 'Lungenembolie nicht ausgeschlossen – weitere Abklärung mit Wells-Score und D-Dimer.' };
      },
      notes: [
        'Die Regel ist nur gültig, wenn alle acht Kriterien negativ sind; die Punktzahl selbst hat keine weitere Bedeutung.',
      ],
      related: [
        { id: 'wells-le', text: 'Weiter mit dem Wells-Score Lungenembolie', when: (t) => t > 0 },
      ],
      sources: [
        { label: 'Kline JA et al. Clinical criteria to prevent unnecessary diagnostic testing in emergency department patients with suspected pulmonary embolism. J Thromb Haemost 2004;2(8):1247–1255', url: 'https://doi.org/10.1111/j.1538-7836.2004.00790.x' },
      ],
    },

    {
      id: 'wells-tvt',
      group: 'Thrombose & Embolie',
      short: 'Wells TVT',
      title: 'Wells-Score Beinvenenthrombose',
      subtitle: 'Klinische Wahrscheinlichkeit einer tiefen Venenthrombose',
      keywords: 'Thrombose TVT Beinvenenthrombose DVT Phlebothrombose D-Dimer',
      usage: {
        when: 'Ambulante Patienten bzw. Notaufnahme mit Verdacht auf tiefe Beinvenenthrombose – Vortestwahrscheinlichkeit bestimmen, um zwischen D-Dimer und direkter Kompressionssonographie zu entscheiden.',
        not: 'Bei stationären Patienten, in der Schwangerschaft und bei Armvenenthrombose nicht ausreichend validiert.',
      },
      items: [
        bool('ca', 'Aktives Malignom', 1, 'Therapie laufend, in den letzten 6 Monaten oder palliativ'),
        bool('par', 'Lähmung, Parese oder kürzliche Gipsruhigstellung des Beins', 1),
        bool('bed', 'Bettlägerigkeit ≥ 3 Tage oder große Operation in den letzten 12 Wochen', 1, 'mit Allgemein- oder Regionalanästhesie'),
        bool('tend', 'Druckschmerz entlang der tiefen Venen', 1),
        bool('leg', 'Schwellung des gesamten Beins', 1),
        bool('calf', 'Wadenumfang ≥ 3 cm größer als Gegenseite', 1, 'gemessen 10 cm unterhalb der Tuberositas tibiae'),
        bool('edema', 'Eindrückbares Ödem, nur am symptomatischen Bein', 1),
        bool('coll', 'Oberflächliche Kollateralvenen (keine Varizen)', 1),
        bool('prev', 'Frühere, dokumentierte TVT', 1),
        bool('alt', 'Alternative Diagnose mindestens ebenso wahrscheinlich', -2),
      ],
      interpret(total) {
        if (total >= 2) return { level: 'high', label: 'TVT wahrscheinlich', text: 'Kompressionssonographie. Ist sie negativ: D-Dimer bestimmen oder Sonographie nach etwa einer Woche wiederholen.' };
        return { level: 'low', label: 'TVT unwahrscheinlich', text: 'D-Dimer bestimmen; ist es negativ, ist eine TVT weitgehend ausgeschlossen. Ist es positiv: Kompressionssonographie.' };
      },
      notes: [
        'Zweistufig nach Wells 2003: ≥ 2 wahrscheinlich, < 2 unwahrscheinlich.',
      ],
      sources: [
        { label: 'Wells PS et al. Evaluation of D-dimer in the diagnosis of suspected deep-vein thrombosis. N Engl J Med 2003;349:1227–1235', url: 'https://doi.org/10.1056/NEJMoa023153' },
      ],
    },

    {
      id: 'nihss',
      group: 'Neurologie',
      short: 'NIHSS',
      title: 'NIH Stroke Scale',
      subtitle: 'Schweregrad des akuten Schlaganfalls (0–42 Punkte)',
      keywords: 'Schlaganfall Stroke Apoplex Hirninfarkt Lyse Thrombektomie',
      usage: {
        when: 'Akuter Schlaganfall: bei Aufnahme zur Einschätzung des Schweregrads und als Grundlage für Thrombolyse- und Thrombektomie-Entscheidungen, danach zur Verlaufskontrolle (z. B. nach Lyse, bei Verschlechterung). Bewertet wird, was der Patient tatsächlich zeigt – nicht, was er vermutlich könnte.',
        not: 'Unterschätzt Ausfälle im hinteren Stromgebiet (Schwindel, Gangataxie, Dysphagie, Doppelbilder). Ein niedriger Wert schließt einen behandlungsbedürftigen Schlaganfall nicht aus.',
      },
      items: [
        choice('1a', '1a · Bewusstseinslage', [
          opt(0, 'Wach'),
          opt(1, 'Benommen', { hint: 'durch geringe Reize weckbar' }),
          opt(2, 'Somnolent / soporös', { hint: 'wiederholte oder starke Reize nötig' }),
          opt(3, 'Koma', { hint: 'nur Reflexe oder keine Reaktion' }),
        ]),
        choice('1b', '1b · Fragen (Monat, Alter)', [
          opt(0, 'Beide richtig'),
          opt(1, 'Eine richtig'),
          opt(2, 'Keine richtig'),
        ]),
        choice('1c', '1c · Aufforderungen (Augen, Hand)', [
          opt(0, 'Beide befolgt'),
          opt(1, 'Eine befolgt'),
          opt(2, 'Keine befolgt'),
        ]),
        choice('2', '2 · Blickbewegungen', [
          opt(0, 'Normal'),
          opt(1, 'Partielle Blickparese'),
          opt(2, 'Forcierte Blickdeviation'),
        ]),
        choice('3', '3 · Gesichtsfeld', [
          opt(0, 'Kein Ausfall'),
          opt(1, 'Partielle Hemianopsie'),
          opt(2, 'Komplette Hemianopsie'),
          opt(3, 'Bilaterale Hemianopsie', { hint: 'inkl. kortikaler Blindheit' }),
        ]),
        choice('4', '4 · Fazialisparese', [
          opt(0, 'Normal'),
          opt(1, 'Gering', { hint: 'verstrichene Nasolabialfalte, Asymmetrie beim Lächeln' }),
          opt(2, 'Partiell', { hint: 'untere Gesichtshälfte' }),
          opt(3, 'Vollständig', { hint: 'obere und untere Gesichtshälfte, ein- oder beidseitig' }),
        ]),
        ...['links', 'rechts'].map((side, i) => choice('5' + 'ab'[i], `5${'ab'[i]} · Motorik Arm ${side}`, [
          opt(0, 'Kein Absinken', { hint: '10 s gehalten' }),
          opt(1, 'Absinken', { hint: 'vor 10 s, berührt die Unterlage nicht' }),
          opt(2, 'Etwas Kraft gegen Schwerkraft'),
          opt(3, 'Keine Kraft gegen Schwerkraft'),
          opt(4, 'Keine Bewegung'),
          UN('Nicht testbar (Amputation, Gelenkversteifung)'),
        ])),
        ...['links', 'rechts'].map((side, i) => choice('6' + 'ab'[i], `6${'ab'[i]} · Motorik Bein ${side}`, [
          opt(0, 'Kein Absinken', { hint: '5 s gehalten' }),
          opt(1, 'Absinken', { hint: 'vor 5 s, berührt die Unterlage nicht' }),
          opt(2, 'Etwas Kraft gegen Schwerkraft'),
          opt(3, 'Keine Kraft gegen Schwerkraft'),
          opt(4, 'Keine Bewegung'),
          UN('Nicht testbar (Amputation, Gelenkversteifung)'),
        ])),
        choice('7', '7 · Extremitätenataxie', [
          opt(0, 'Keine', { hint: 'auch bei Lähmung oder fehlendem Verständnis' }),
          opt(1, 'In einer Extremität'),
          opt(2, 'In zwei Extremitäten'),
          UN('Nicht testbar (Amputation, Gelenkversteifung)'),
        ]),
        choice('8', '8 · Sensibilität', [
          opt(0, 'Normal'),
          opt(1, 'Leicht bis mittelschwer vermindert'),
          opt(2, 'Schwer bis vollständig vermindert'),
        ]),
        choice('9', '9 · Sprache', [
          opt(0, 'Keine Aphasie'),
          opt(1, 'Leichte bis mittelschwere Aphasie'),
          opt(2, 'Schwere Aphasie'),
          opt(3, 'Stumm, globale Aphasie'),
        ]),
        choice('10', '10 · Dysarthrie', [
          opt(0, 'Normal'),
          opt(1, 'Leicht bis mittelschwer'),
          opt(2, 'Schwer', { hint: 'unverständlich oder anarthrisch' }),
          UN('Nicht testbar (Intubation, mechanisches Hindernis)'),
        ]),
        choice('11', '11 · Neglect / Auslöschung', [
          opt(0, 'Kein Neglect'),
          opt(1, 'In einer Modalität', { hint: 'visuell, taktil, auditiv, räumlich oder personal' }),
          opt(2, 'Ausgeprägt oder in mehr als einer Modalität'),
        ]),
      ],
      interpret(total) {
        if (total === 0) return { level: 'low', label: 'Kein Defizit', text: 'Keine in der NIHSS erfassten Ausfälle.' };
        if (total <= 4) return { level: 'low', label: 'Leichter Schlaganfall', text: 'NIHSS 1–4.' };
        if (total <= 15) return { level: 'mid', label: 'Mittelschwerer Schlaganfall', text: 'NIHSS 5–15.' };
        if (total <= 20) return { level: 'high', label: 'Mittelschwer bis schwer', text: 'NIHSS 16–20.' };
        return { level: 'high', label: 'Schwerer Schlaganfall', text: 'NIHSS 21–42.' };
      },
      notes: [
        'Die Schweregrad-Einteilung ist gebräuchlich, stammt aber nicht aus der Originalpublikation.',
        'Die Indikation zur Thrombolyse oder Thrombektomie richtet sich nicht allein nach der NIHSS – auch leichte, aber behindernde Defizite können behandlungsbedürftig sein.',
        'Als „nicht testbar“ markierte Items gehen mit 0 Punkten ein und sollten dokumentiert werden.',
      ],
      sources: [
        { label: 'Brott T et al. Measurements of acute cerebral infarction: a clinical examination scale. Stroke 1989;20(7):864–870', url: 'https://doi.org/10.1161/01.STR.20.7.864' },
      ],
    },

    {
      id: 'abcd2',
      group: 'Neurologie',
      short: 'ABCD²',
      title: 'ABCD²-Score',
      subtitle: 'Transitorische ischämische Attacke: Schlaganfallrisiko in den folgenden 2 Tagen',
      keywords: 'ABCD2 TIA transitorische ischämische Attacke Schlaganfall',
      usage: {
        when: 'Nach einer transitorischen ischämischen Attacke (Symptome vollständig zurückgebildet) – Abschätzung des frühen Schlaganfallrisikos, etwa für die Kommunikation mit Patienten und Weiterbehandlern.',
        not: 'Nicht allein über Dringlichkeit oder stationäre Aufnahme entscheiden: Leitlinien (u. a. NICE) empfehlen, alle TIA-Patienten unabhängig vom Score umgehend abzuklären, weil auch niedrige Werte relevante Befunde (z. B. Karotisstenose, Vorhofflimmern) nicht ausschließen.',
      },
      items: [
        bool('age', 'Alter ≥ 60 Jahre', 1),
        bool('bp', 'Blutdruck ≥ 140/90 mmHg', 1, 'bei der ersten Messung nach dem Ereignis'),
        choice('c', 'Klinik', [
          opt(0, 'Andere Symptome'),
          opt(1, 'Sprachstörung ohne Schwäche'),
          opt(2, 'Einseitige Schwäche'),
        ]),
        choice('d', 'Dauer der Symptome', [
          opt(0, '< 10 min'),
          opt(1, '10–59 min'),
          opt(2, '≥ 60 min'),
        ]),
        bool('dm', 'Diabetes mellitus', 1),
      ],
      interpret(total) {
        if (total <= 3) return { level: 'low', label: 'Niedriges Risiko', text: 'Schlaganfallrisiko in 2 Tagen in der Validierung 1,0 %. Trotzdem zeitnahe Abklärung.' };
        if (total <= 5) return { level: 'mid', label: 'Mittleres Risiko', text: 'Schlaganfallrisiko in 2 Tagen in der Validierung 4,1 %. Abklärung ohne Verzögerung.' };
        return { level: 'high', label: 'Hohes Risiko', text: 'Schlaganfallrisiko in 2 Tagen in der Validierung 8,1 %. Sofortige Abklärung, möglichst auf einer Stroke Unit.' };
      },
      related: [
        { id: 'nihss', text: 'Bei anhaltenden Ausfällen: NIHSS' },
      ],
      sources: [
        { label: 'Johnston SC et al. Validation and refinement of scores to predict very early stroke risk after transient ischaemic attack. Lancet 2007;369(9558):283–292', url: 'https://doi.org/10.1016/S0140-6736(07)60150-0' },
      ],
    },

    {
      id: '4at',
      group: 'Neurologie',
      short: '4AT',
      title: '4AT',
      subtitle: 'Schnelles Delir-Screening in unter zwei Minuten (0–12 Punkte)',
      keywords: '4AT Delir Delirium Verwirrtheit kognitive Störung Demenz geriatrisch Screening',
      usage: {
        when: 'Ältere oder akut erkrankte Patienten in Notaufnahme, auf Station oder nach Operationen: schnelles Delir-Screening ohne besondere Schulung, auch bei Patienten, die nicht vollständig testbar sind.',
        not: 'Screening, keine Diagnose – ein auffälliges Ergebnis erfordert eine ärztliche Beurteilung. Bei Sprach- oder Hörbarrieren eingeschränkt aussagekräftig.',
      },
      items: [
        choice('alert', '1 · Wachheit', [
          opt(0, 'Normal', { hint: 'vollständig wach, nicht agitiert' }),
          opt(0, 'Leicht schläfrig', { hint: 'nach dem Wecken innerhalb von 10 Sekunden normal' }),
          opt(4, 'Deutlich auffällig', { hint: 'schwer weckbar, schläfrig oder agitiert bzw. hyperaktiv' }),
        ]),
        choice('amt4', '2 · AMT4', [
          opt(0, 'Kein Fehler'),
          opt(1, '1 Fehler'),
          opt(2, '2 oder mehr Fehler oder nicht testbar'),
        ], 'Alter, Geburtsdatum, Ort (Name der Klinik oder des Gebäudes), aktuelles Jahr'),
        choice('att', '3 · Aufmerksamkeit', [
          opt(0, '7 oder mehr Monate richtig'),
          opt(1, 'Beginnt, aber weniger als 7 Monate richtig oder verweigert'),
          opt(2, 'Nicht testbar', { hint: 'kann wegen Unwohlsein, Schläfrigkeit oder Unaufmerksamkeit nicht beginnen' }),
        ], 'Monate rückwärts aufsagen, beginnend mit Dezember'),
        choice('acute', '4 · Akute Veränderung oder fluktuierender Verlauf', [
          opt(0, 'Nein'),
          opt(4, 'Ja', { hint: 'Aufmerksamkeit, Kognition oder andere geistige Funktionen in den letzten 2 Wochen verändert und noch vorhanden' }),
        ], 'Auch aus Fremdanamnese, Pflegedokumentation oder Vorbefunden'),
      ],
      interpret(total) {
        if (total >= 4) return { level: 'high', label: 'Delir möglich', text: 'Mit oder ohne kognitive Beeinträchtigung. Ärztliche Beurteilung und Suche nach Auslösern: Infektion, Medikamente, Elektrolytstörung, Hypoxie, Schmerz, Harnverhalt, Obstipation, Entzug.' };
        if (total >= 1) return { level: 'mid', label: 'Kognitive Beeinträchtigung möglich', text: 'Weitere kognitive Testung erwägen. Ein Delir ist nicht sicher ausgeschlossen, wenn die Angaben zu Punkt 4 unvollständig sind.' };
        return { level: 'low', label: 'Delir unwahrscheinlich', text: 'Delir oder schwere kognitive Beeinträchtigung unwahrscheinlich. Ein Delir bleibt möglich, wenn die Angaben zu Punkt 4 unvollständig sind.' };
      },
      sources: [
        { label: 'Bellelli G et al. Validation of the 4AT, a new instrument for rapid delirium screening: a study in 234 hospitalised older people. Age Ageing 2014;43(4):496–502', url: 'https://doi.org/10.1093/ageing/afu021' },
        { label: 'Tieges Z et al. Diagnostic accuracy of the 4AT for delirium detection in older adults: systematic review and meta-analysis. Age Ageing 2021;50(3):733–743', url: 'https://doi.org/10.1093/ageing/afaa224' },
      ],
    },

    {
      id: 'gbs',
      group: 'Gastro & Leber',
      short: 'Blatchford',
      title: 'Glasgow-Blatchford-Score',
      subtitle: 'Obere gastrointestinale Blutung: Bedarf an Intervention und ambulante Führbarkeit (0–23 Punkte)',
      keywords: 'Blatchford GBS GI-Blutung gastrointestinale Blutung obere Hämatemesis Meläna Teerstuhl Kaffeesatz Ulkus Endoskopie Gastroskopie',
      usage: {
        when: 'Obere gastrointestinale Blutung (Hämatemesis, Kaffeesatzerbrechen, Meläna) vor der Endoskopie: abschätzen, ob eine Intervention (Transfusion, endoskopische Therapie, Operation) nötig wird – vor allem, um Patienten mit sehr niedrigem Risiko ambulant führen zu können.',
        not: 'Nicht für untere GI-Blutungen. Ersetzt nicht die Kreislaufstabilisierung – instabile Patienten unabhängig vom Score sofort versorgen. Unter Antikoagulation und bei Verdacht auf Varizenblutung besonders vorsichtig entscheiden.',
      },
      items: [
        num('urea', 'Harnstoff', UREA, 5, 600, SHARED('urea')),
        SEX('sex'),
        num('hb', 'Hämoglobin', HB, 2, 25, SHARED('hb')),
        num('sbp', 'Systolischer Blutdruck', MMHG, 30, 300, SHARED('sbp')),
        bool('hr', 'Puls ≥ 100/min', 1),
        bool('melena', 'Meläna', 1),
        bool('syncope', 'Synkope', 2),
        bool('liver', 'Lebererkrankung', 2, 'anamnestisch oder klinisch'),
        bool('chf', 'Herzinsuffizienz', 2, 'anamnestisch oder klinisch'),
      ],
      max: 23,
      compute(a) {
        const p = gbsParts(a);
        return p.urea + p.hb + p.sbp + p.other;
      },
      interpret(total, a) {
        const p = gbsParts(a);
        const parts = `Harnstoff ${p.urea} · Hämoglobin ${p.hb} · Blutdruck ${p.sbp} · weitere ${p.other}.`;
        if (total <= 1) return { level: 'low', label: 'Sehr niedriges Risiko', text: `${parts} Nach der ESGE-Leitlinie ist bei einem Score ≤ 1 keine stationäre Aufnahme und keine frühe Endoskopie nötig, sofern nichts anderes dagegen spricht; ambulante Abklärung.` };
        if (total <= 6) return { level: 'mid', label: 'Intervention möglich', text: `${parts} Stationäre Aufnahme; Endoskopie innerhalb von 24 Stunden nach hämodynamischer Stabilisierung.` };
        return { level: 'high', label: 'Hohes Risiko', text: `${parts} Hohe Wahrscheinlichkeit für Transfusion, endoskopische Therapie oder Operation. Stabilisieren, Endoskopie innerhalb von 24 Stunden – bei Instabilität früher.` };
      },
      notes: [
        'Harnstoff (mmol/l): < 6,5 → 0, 6,5–7,9 → 2, 8–9,9 → 3, 10–24,9 → 4, ≥ 25 → 6 Punkte. Hämoglobin (g/dl) Männer: ≥ 13 → 0, 12–12,9 → 1, 10–11,9 → 3, < 10 → 6; Frauen: ≥ 12 → 0, 10–11,9 → 1, < 10 → 6. Systolischer Blutdruck: ≥ 110 → 0, 100–109 → 1, 90–99 → 2, < 90 → 3 Punkte.',
        'In einer großen internationalen Vergleichsstudie sagte ein Wert ≥ 7 die Notwendigkeit einer Intervention am besten voraus.',
      ],
      sources: [
        { label: 'Blatchford O et al. A risk score to predict need for treatment for upper-gastrointestinal haemorrhage. Lancet 2000;356(9238):1318–1321', url: 'https://doi.org/10.1016/S0140-6736(00)02816-6' },
        { label: 'Stanley AJ et al. Comparison of risk scoring systems for patients presenting with upper gastrointestinal bleeding: international multicentre prospective study. BMJ 2017;356:i6432', url: 'https://doi.org/10.1136/bmj.i6432' },
        { label: 'Gralnek IM et al. Endoscopic diagnosis and management of nonvariceal upper gastrointestinal hemorrhage (NVUGIH): ESGE Guideline – Update 2021. Endoscopy 2021;53(3):300–332', url: 'https://doi.org/10.1055/a-1369-5274' },
      ],
    },

    {
      id: 'child-pugh',
      group: 'Gastro & Leber',
      short: 'Child-Pugh',
      title: 'Child-Pugh-Score',
      subtitle: 'Leberzirrhose: Schweregrad der Leberfunktionsstörung (5–15 Punkte)',
      keywords: 'Leberzirrhose Zirrhose Leber Child',
      usage: {
        when: 'Bekannte Leberzirrhose – Schweregrad und Prognose einschätzen, z. B. vor Operationen, für die Dosisanpassung von Medikamenten (viele Fachinformationen beziehen sich auf Child-Pugh) und bei der Therapieplanung (TIPS, HCC-Therapie).',
        not: 'Aszites und Enzephalopathie werden subjektiv eingeschätzt. Unter Antikoagulation ist der INR nicht verwertbar. Für die Transplantations-Allokation wird MELD verwendet.',
      },
      items: [
        choice('bili', 'Bilirubin', [
          opt(1, '< 2 mg/dl', { hint: '< 34 µmol/l' }),
          opt(2, '2–3 mg/dl', { hint: '34–50 µmol/l' }),
          opt(3, '> 3 mg/dl', { hint: '> 50 µmol/l' }),
        ]),
        choice('alb', 'Albumin', [
          opt(1, '> 3,5 g/dl', { hint: '> 35 g/l' }),
          opt(2, '2,8–3,5 g/dl', { hint: '28–35 g/l' }),
          opt(3, '< 2,8 g/dl', { hint: '< 28 g/l' }),
        ]),
        choice('inr', 'INR', [
          opt(1, '< 1,7'),
          opt(2, '1,7–2,3'),
          opt(3, '> 2,3'),
        ], 'Im Original: Verlängerung der Prothrombinzeit um 1–4 / 4–6 / > 6 Sekunden'),
        choice('asc', 'Aszites', [
          opt(1, 'Kein'),
          opt(2, 'Leicht', { hint: 'oder medikamentös gut kontrolliert' }),
          opt(3, 'Mittel- bis hochgradig', { hint: 'oder therapierefraktär' }),
        ]),
        choice('he', 'Hepatische Enzephalopathie', [
          opt(1, 'Keine'),
          opt(2, 'Grad I–II', { hint: 'oder medikamentös kontrolliert' }),
          opt(3, 'Grad III–IV', { hint: 'oder therapierefraktär' }),
        ]),
      ],
      interpret(total) {
        if (total <= 6) return { level: 'low', label: 'Child-Pugh A', text: 'Gut kompensierte Zirrhose (5–6 Punkte).' };
        if (total <= 9) return { level: 'mid', label: 'Child-Pugh B', text: 'Deutliche funktionelle Einschränkung (7–9 Punkte). Erhöhtes perioperatives Risiko; Medikamentendosierung prüfen.' };
        return { level: 'high', label: 'Child-Pugh C', text: 'Dekompensierte Zirrhose (10–15 Punkte). Hohes perioperatives Risiko; Vorstellung in einem Transplantationszentrum prüfen.' };
      },
      notes: [
        'Bei primär biliärer Cholangitis und primär sklerosierender Cholangitis gelten höhere Bilirubin-Grenzen (1–4 / 4–10 / > 10 mg/dl).',
      ],
      related: [
        { id: 'meld', text: 'Prognose mit dem MELD-Score' },
      ],
      sources: [
        { label: 'Pugh RN et al. Transection of the oesophagus for bleeding oesophageal varices. Br J Surg 1973;60(8):646–649', url: 'https://doi.org/10.1002/bjs.1800600817' },
      ],
    },

    {
      id: 'meld',
      group: 'Gastro & Leber',
      short: 'MELD',
      title: 'MELD-Score',
      subtitle: 'Model for End-Stage Liver Disease: 3-Monats-Letalität bei fortgeschrittener Lebererkrankung (6–40)',
      keywords: 'Leber Zirrhose Lebertransplantation labMELD Eurotransplant',
      usage: {
        when: 'Fortgeschrittene chronische Lebererkrankung – objektive Abschätzung der 3-Monats-Letalität, z. B. vor TIPS oder größeren Operationen. In der Eurotransplant-Region Grundlage der Organallokation für Lebertransplantationen (labMELD).',
        not: 'Unter Vitamin-K-Antagonisten ist der INR nicht verwertbar. Hyponatriämie verschlechtert die Prognose zusätzlich (MELD-Na); bei bestimmten Erkrankungen wie HCC bildet der labMELD die Dringlichkeit nicht ab (Standard-Exceptions).',
      },
      items: [
        num('bili', 'Bilirubin', BILI, 0.1, 70, SHARED('bili')),
        num('inr', 'INR', [], 0.5, 20),
        num('crea', 'Kreatinin', CREA, 0.1, 30, SHARED('crea')),
        flag('dial', 'Nierenersatztherapie', 'Dialyse ≥ 2 × in der letzten Woche oder CVVHD ≥ 24 h – Kreatinin wird dann mit 4 mg/dl gerechnet'),
      ],
      max: 40,
      compute(a) {
        const bili = Math.max(1, a.bili);
        const inr = Math.max(1, a.inr);
        const crea = a.dial ? 4 : Math.min(4, Math.max(1, a.crea));
        const meld = 3.78 * Math.log(bili) + 11.2 * Math.log(inr) + 9.57 * Math.log(crea) + 6.43;
        return Math.min(40, Math.max(6, Math.round(meld)));
      },
      interpret(total) {
        if (total < 10) return { level: 'low', label: 'Niedrige Letalität', text: '3-Monats-Letalität in der Validierung 1,9 % (MELD < 10).' };
        if (total < 20) return { level: 'mid', label: 'Mittlere Letalität', text: '3-Monats-Letalität in der Validierung 6,0 % (MELD 10–19).' };
        if (total < 30) return { level: 'high', label: 'Hohe Letalität', text: '3-Monats-Letalität in der Validierung 19,6 % (MELD 20–29).' };
        if (total < 40) return { level: 'high', label: 'Sehr hohe Letalität', text: '3-Monats-Letalität in der Validierung 52,6 % (MELD 30–39).' };
        return { level: 'high', label: 'Sehr hohe Letalität', text: '3-Monats-Letalität in der Validierung 71,3 % (MELD ≥ 40).' };
      },
      notes: [
        'Berechnet wird der ursprüngliche MELD (labMELD, wie bei Eurotransplant): 3,78 × ln(Bilirubin) + 11,2 × ln(INR) + 9,57 × ln(Kreatinin) + 6,43. Werte < 1 werden als 1 gerechnet, Kreatinin höchstens mit 4 mg/dl.',
        'MELD-Na und MELD 3.0 (USA) berücksichtigen zusätzlich Natrium, Albumin und Geschlecht und sind hier nicht umgesetzt.',
      ],
      related: [
        { id: 'child-pugh', text: 'Schweregrad mit Child-Pugh' },
      ],
      sources: [
        { label: 'Kamath PS et al. A model to predict survival in patients with end-stage liver disease. Hepatology 2001;33(2):464–470', url: 'https://doi.org/10.1053/jhep.2001.22172' },
        { label: 'Wiesner R et al. Model for end-stage liver disease (MELD) and allocation of donor livers. Gastroenterology 2003;124(1):91–96', url: 'https://doi.org/10.1053/gast.2003.50016' },
      ],
    },

    {
      id: 'egfr',
      group: 'Niere & Labor',
      short: 'eGFR',
      title: 'eGFR nach CKD-EPI 2021',
      subtitle: 'Geschätzte glomeruläre Filtrationsrate aus Serumkreatinin, Alter und Geschlecht',
      keywords: 'Niere Kreatinin GFR Nierenfunktion Niereninsuffizienz CKD KDIGO',
      unit: 'ml/min/1,73 m²',
      usage: {
        when: 'Erwachsene mit stabilem Serumkreatinin – Nierenfunktion abschätzen, CKD-Stadium nach KDIGO einteilen und Medikamente dosieren.',
        not: 'Nicht bei akuter Nierenschädigung (Kreatinin nicht im Gleichgewicht), bei extremer Muskelmasse (Amputation, Kachexie, Bodybuilding, Querschnitt), in der Schwangerschaft und bei Kindern. Für die Dosierung bei sehr großer oder kleiner Körperoberfläche die absolute GFR (ml/min) berücksichtigen.',
      },
      items: [
        num('crea', 'Serumkreatinin', CREA, 0.1, 30, { shared: 'crea', hint: 'enzymatisch bzw. IDMS-standardisiert' }),
        num('age', 'Alter', YEARS, 18, 120, SHARED('age')),
        choice('sex', 'Geschlecht', [
          pick('Weiblich', { key: 'f' }),
          pick('Männlich', { key: 'm' }),
        ]),
      ],
      max: null,
      compute(a) {
        const female = a.sex.key === 'f';
        const k = female ? 0.7 : 0.9;
        const alpha = female ? -0.241 : -0.302;
        const r = a.crea / k;
        const egfr = 142 * Math.pow(Math.min(r, 1), alpha) * Math.pow(Math.max(r, 1), -1.2) * Math.pow(0.9938, a.age) * (female ? 1.012 : 1);
        return Math.round(egfr);
      },
      interpret(total) {
        if (total >= 90) return { level: 'low', label: 'KDIGO G1', text: 'Normale oder hohe GFR. Eine chronische Nierenkrankheit liegt nur bei zusätzlichen Schädigungszeichen (z. B. Albuminurie) vor.' };
        if (total >= 60) return { level: 'low', label: 'KDIGO G2', text: 'Leicht eingeschränkte GFR. Eine chronische Nierenkrankheit liegt nur bei zusätzlichen Schädigungszeichen (z. B. Albuminurie) vor.' };
        if (total >= 45) return { level: 'mid', label: 'KDIGO G3a', text: 'Leicht- bis mittelgradig eingeschränkte GFR. Nephrotoxische Medikamente meiden, Dosierungen prüfen.' };
        if (total >= 30) return { level: 'mid', label: 'KDIGO G3b', text: 'Mittel- bis hochgradig eingeschränkte GFR. Dosierungen prüfen, nephrologische Mitbetreuung erwägen.' };
        if (total >= 15) return { level: 'high', label: 'KDIGO G4', text: 'Hochgradig eingeschränkte GFR. Nephrologische Mitbetreuung, Vorbereitung einer Nierenersatztherapie besprechen.' };
        return { level: 'high', label: 'KDIGO G5', text: 'Nierenversagen. Nierenersatztherapie bzw. Transplantation prüfen.' };
      },
      notes: [
        'CKD-EPI 2021 ohne Ethnie-Faktor. Eine chronische Nierenkrankheit setzt eine Dauer von mehr als 3 Monaten voraus.',
        'Ist die Kreatinin-Schätzung fraglich, hilft die Kombination mit Cystatin C (CKD-EPI Kreatinin-Cystatin).',
      ],
      related: [
        { id: 'akin', text: 'Kreatinin steigt akut an? AKIN-Stadium' },
        { id: 'urin', text: 'Akute Nierenschädigung: Urin-Indizes' },
      ],
      sources: [
        { label: 'Inker LA et al. New creatinine- and cystatin C-based equations to estimate GFR without race. N Engl J Med 2021;385:1737–1749', url: 'https://doi.org/10.1056/NEJMoa2102953' },
      ],
    },

    {
      id: 'akin',
      group: 'Niere & Labor',
      short: 'AKIN',
      title: 'AKIN-Stadien der akuten Nierenschädigung',
      subtitle: 'Akute Nierenschädigung nach Kreatininanstieg und Urinausscheidung einteilen (Acute Kidney Injury Network)',
      keywords: 'AKI ANV akutes Nierenversagen akute Nierenschädigung Kreatininanstieg Oligurie Anurie Urinausscheidung Dialyse Nierenersatztherapie KDIGO RIFLE',
      rule: true,
      usage: {
        when: 'Verdacht auf akute Nierenschädigung, z. B. bei Kreatininanstieg oder Oligurie auf der Intensivstation, nach Operationen, bei Sepsis oder Kontrastmittelgabe: Diagnose stellen und Schweregrad in Stadium 1–3 einteilen. Der Kreatininanstieg muss innerhalb von 48 Stunden aufgetreten sein; als Ausgangswert dient der niedrigste Wert dieses Zeitraums.',
        not: 'Erst nach ausreichender Volumengabe und Ausschluss einer Harnabflussstörung anwenden. Ein langsamerer Anstieg (über bis zu 7 Tage) wird nur von den KDIGO-Kriterien erfasst. Die Urinausscheidung ist unter Diuretika nur eingeschränkt verwertbar. Nicht für die chronische Niereninsuffizienz.',
      },
      items: [
        num('base', 'Kreatinin-Ausgangswert', CREA, 0.1, 30, { hint: 'niedrigster Wert der letzten 48 Stunden' }),
        num('crea', 'Aktuelles Kreatinin', CREA, 0.1, 30, SHARED('crea')),
        choice('uo', 'Urinausscheidung', [
          pick('Nicht vermindert', { stage: 0, hint: '≥ 0,5 ml/kg/h' }),
          pick('< 0,5 ml/kg/h über mehr als 6 Stunden', { stage: 1 }),
          pick('< 0,5 ml/kg/h über mehr als 12 Stunden', { stage: 2 }),
          pick('< 0,3 ml/kg/h über 24 Stunden oder Anurie über 12 Stunden', { stage: 3 }),
          pick('Nicht erfasst', { stage: 0, key: 'unknown', hint: 'Einteilung nur nach Kreatinin' }),
        ]),
        flag('rrt', 'Nierenersatztherapie begonnen', 'zählt immer als Stadium 3'),
      ],
      max: 3,
      compute(a) {
        return Math.max(akinCreaStage(a), a.uo.stage, a.rrt ? 3 : 0);
      },
      interpret(total, a) {
        const LEVEL = ['low', 'mid', 'high', 'high'];
        const diff = a.crea - a.base;
        const crea = akinCreaStage(a);
        const rows = [
          {
            name: 'Kreatinin',
            value: `${diff >= 0 ? '+' : ''}${formatNumber(diff, 2)} mg/dl`,
            note: `${formatNumber(a.crea / a.base, 2)}-facher Ausgangswert${crea ? ` – Stadium ${crea}` : ' – kein Kriterium erfüllt'}`,
            level: LEVEL[crea],
          },
          {
            name: 'Urinausscheidung',
            value: a.uo.key === 'unknown' ? 'nicht erfasst' : a.uo.stage ? `Stadium ${a.uo.stage}` : 'normal',
            note: a.uo.label,
            level: a.uo.key === 'unknown' ? 'pending' : LEVEL[a.uo.stage],
          },
        ];
        if (a.rrt) rows.push({ name: 'Nierenersatztherapie', value: 'ja', note: 'Stadium 3', level: 'high' });
        const base = { scoreName: 'AKIN', rows };
        const cause = 'Ursache klären (prärenal, renal, postrenal – Sonographie), Nephrotoxine absetzen und Dosierungen an die Nierenfunktion anpassen, Volumenstatus und Kreislauf optimieren, Kreatinin und Urinausscheidung engmaschig kontrollieren.';
        if (total === 0) {
          const unknown = a.uo.key === 'unknown' ? ' Die Urinausscheidung wurde nicht berücksichtigt.' : '';
          return Object.assign(base, { level: 'low', label: 'Keine akute Nierenschädigung nach AKIN', text: `Die Kriterien sind nicht erfüllt.${unknown} Bei Risikopatienten Kreatinin und Urinausscheidung weiter kontrollieren.` });
        }
        if (total === 1) return Object.assign(base, { level: 'mid', label: 'AKIN-Stadium 1', text: cause });
        if (total === 2) return Object.assign(base, { level: 'high', label: 'AKIN-Stadium 2', text: `${cause} Nephrologische Mitbetreuung erwägen.` });
        return Object.assign(base, { level: 'high', label: 'AKIN-Stadium 3', text: `${cause} Nephrologische Mitbetreuung; Indikation zur Nierenersatztherapie prüfen (therapierefraktäre Hyperkaliämie, Azidose, Überwässerung, urämische Komplikationen).` });
      },
      notes: [
        'Diagnose: Anstieg des Kreatinins innerhalb von 48 Stunden um ≥ 0,3 mg/dl (≥ 26,5 µmol/l) oder auf ≥ 150 % des Ausgangswerts, oder Urinausscheidung < 0,5 ml/kg/h über mehr als 6 Stunden.',
        'Stadium 1: Kreatinin + ≥ 0,3 mg/dl oder 1,5- bis 2-fach. Stadium 2: mehr als 2- bis 3-fach oder < 0,5 ml/kg/h über mehr als 12 Stunden. Stadium 3: mehr als 3-fach, Kreatinin ≥ 4,0 mg/dl (354 µmol/l) bei akutem Anstieg um ≥ 0,5 mg/dl, < 0,3 ml/kg/h über 24 Stunden, Anurie über 12 Stunden oder Nierenersatztherapie. Es zählt das höchste erreichte Stadium.',
        'Die KDIGO-Kriterien (2012) übernehmen die Stadien weitgehend, werten aber auch einen Anstieg auf das 1,5-Fache innerhalb von 7 Tagen.',
      ],
      related: [
        { id: 'urin', text: 'Prärenal oder renal? Urin-Indizes', when: (t) => t >= 1 },
      ],
      sources: [
        { label: 'Mehta RL et al. Acute Kidney Injury Network: report of an initiative to improve outcomes in acute kidney injury. Crit Care 2007;11(2):R31', url: 'https://doi.org/10.1186/cc5713' },
        { label: 'KDIGO Clinical Practice Guideline for Acute Kidney Injury. Kidney Int Suppl 2012;2(1):1–138', url: 'https://doi.org/10.1038/kisup.2012.1' },
      ],
    },

    {
      id: 'urin',
      group: 'Niere & Labor',
      short: 'Urin-Indizes',
      title: 'Urin-Indizes',
      subtitle: 'Akute Nierenschädigung: prärenal oder renal? FENa, FEUrea, U/P-Kreatinin, Urin-Natrium, Osmolalität und Urin-Anionenlücke',
      keywords: 'FENa FEUrea fraktionelle Natriumexkretion Harnstoffexkretion akutes Nierenversagen ANV AKI prärenal ATN Tubulusnekrose Urin Osmolalität Urin-Anionenlücke RTA',
      unit: '%',
      usage: {
        when: 'Akute Nierenschädigung (Kreatininanstieg, Oligurie): Unterscheidung zwischen prärenaler Ursache (Volumenmangel, verminderte Nierenperfusion) und intrarenaler Schädigung, vor allem akuter Tubulusnekrose. Urin und Serum möglichst zeitgleich abnehmen, am besten vor Volumen- oder Diuretikagabe. Die Urin-Anionenlücke (optional) hilft bei hyperchlorämer metabolischer Azidose.',
        not: 'Unter Diuretika ist die FENa nicht verwertbar – dann FEUrea nutzen. Eingeschränkt bei vorbestehender chronischer Niereninsuffizienz, osmotischer Diurese (Glukosurie, Mannitol, Kontrastmittel) und Nebenniereninsuffizienz. Eine niedrige FENa kommt auch bei Kontrastmittelnephropathie, Rhabdomyolyse, Sepsis, Glomerulonephritis und früher Obstruktion vor. Eine postrenale Ursache sonographisch ausschließen.',
      },
      items: [
        num('sna', 'Serum-Natrium', MMOL, 100, 200, SHARED('na')),
        num('screa', 'Serum-Kreatinin', CREA, 0.1, 30, SHARED('crea')),
        num('surea', 'Serum-Harnstoff', UREA, 5, 600, { optional: true, shared: 'urea', hint: 'für FEUrea und BUN/Kreatinin' }),
        num('una', 'Urin-Natrium', MMOL, 1, 400),
        num('ucrea', 'Urin-Kreatinin', UCREA, 1, 1000),
        num('uurea', 'Urin-Harnstoff', UREA, 50, 10000, { optional: true, hint: 'für FEUrea' }),
        num('uosm', 'Urin-Osmolalität', [unit('mosm/kg', 1, 0)], 50, 1500, { optional: true }),
        num('uk', 'Urin-Kalium', MMOL, 1, 300, { optional: true, hint: 'für die Urin-Anionenlücke' }),
        num('ucl', 'Urin-Chlorid', MMOL, 1, 400, { optional: true, hint: 'für die Urin-Anionenlücke' }),
        flag('diur', 'Diuretika in den letzten 24 Stunden', 'FENa und Urin-Natrium sind dann nicht verwertbar'),
      ],
      max: null,
      compute(a) {
        const u = urineIndices(a);
        const v = u.primary.raw;
        return v < 10 ? Math.round(v * 100) / 100 : round1(v);
      },
      interpret(total, a) {
        const u = urineIndices(a);
        const p = u.primary;
        const others = u.rows.filter((r) => r !== p && r.vote);
        const agree = others.filter((r) => r.cls === p.cls).length;
        const against = others.filter((r) => r.cls !== p.cls && r.cls !== 'unclear').length;
        const consensus = !p.vote || p.cls === 'unclear' || !others.length ? ''
          : ` ${agree} von ${others.length} weiteren Indizes passen dazu${against ? `, ${against} sprechen dagegen – Befunde im klinischen Kontext gewichten` : ''}.`;
        const base = { scoreName: p.name, rows: u.rows.map(({ name, value, note, level }) => ({ name, value, note, level })) };
        if (!p.vote) {
          return Object.assign(base, { level: 'mid', label: 'Nicht verwertbar', text: 'Unter Diuretika ist die FENa nicht aussagekräftig. Für eine Einordnung Serum- und Urin-Harnstoff eingeben (FEUrea).' });
        }
        if (p.cls === 'pre') {
          return Object.assign(base, { level: 'low', label: 'Prärenales Muster', text: `Hinweis auf eine prärenale Ursache (Volumenmangel, verminderte Nierenperfusion, z. B. bei Herzinsuffizienz oder Leberzirrhose). Volumenstatus prüfen; eine Besserung nach Volumengabe stützt die Diagnose.${consensus}` });
        }
        if (p.cls === 'renal') {
          return Object.assign(base, { level: 'high', label: 'Renales Muster', text: `Hinweis auf eine intrarenale Schädigung, am häufigsten akute Tubulusnekrose (ischämisch, septisch, toxisch). Urinsediment, Medikamente und Nephrotoxine prüfen.${consensus}` });
        }
        return Object.assign(base, { level: 'mid', label: 'Nicht eindeutig', text: `${p.name} im Graubereich. Weitere Indizes, Urinsediment, Verlauf und Sonographie heranziehen.${consensus}` });
      },
      notes: [
        'FENa = (U-Na × S-Krea) / (S-Na × U-Krea) × 100. FEUrea = (U-Harnstoff × S-Krea) / (S-Harnstoff × U-Krea) × 100. Urin-Anionenlücke = U-Na + U-K − U-Cl.',
        'Grenzwerte prärenal / renal: FENa < 1 % / > 2 %, FEUrea ≤ 35 % / > 50 %, U/P-Kreatinin > 40 / < 20, Urin-Natrium < 20 / > 40 mmol/l, Urin-Osmolalität > 500 / < 350 mosm/kg, BUN/Kreatinin > 20 / < 15.',
        'Die Urin-Anionenlücke ist nur bei hyperchlorämer metabolischer Azidose und einem Urin-Natrium ≥ 20 mmol/l verwertbar; Ketonurie und Medikamente mit Anionen (z. B. Penicilline) verfälschen sie.',
      ],
      related: [
        { id: 'akin', text: 'Schweregrad der Nierenschädigung: AKIN-Stadium' },
        { id: 'anion-gap', text: 'Metabolische Azidose: Anionenlücke im Serum' },
      ],
      sources: [
        { label: 'Espinel CH. The FENa test. Use in the differential diagnosis of acute renal failure. JAMA 1976;236(6):579–581', url: 'https://doi.org/10.1001/jama.1976.03270060029022' },
        { label: 'Miller TR et al. Urinary diagnostic indices in acute renal failure: a prospective study. Ann Intern Med 1978;89(1):47–50', url: 'https://doi.org/10.7326/0003-4819-89-1-47' },
        { label: 'Carvounis CP et al. Significance of the fractional excretion of urea in the differential diagnosis of acute renal failure. Kidney Int 2002;62(6):2223–2229', url: 'https://doi.org/10.1046/j.1523-1755.2002.00683.x' },
        { label: 'Batlle DC et al. The use of the urinary anion gap in the diagnosis of hyperchloremic metabolic acidosis. N Engl J Med 1988;318(10):594–599', url: 'https://doi.org/10.1056/NEJM198803103181002' },
      ],
    },

    {
      id: 'anion-gap',
      group: 'Niere & Labor',
      short: 'Anionenlücke',
      title: 'Anionenlücke',
      subtitle: 'Metabolische Azidose: Additions- oder Subtraktionsazidose?',
      keywords: 'Anion Gap Säure-Basen Azidose BGA Blutgasanalyse Bicarbonat Laktat Ketoazidose',
      unit: 'mmol/l',
      usage: {
        when: 'Metabolische Azidose (erniedrigtes Bicarbonat): unterscheiden zwischen Additionsazidose mit erhöhter Anionenlücke (z. B. Laktat, Ketone, Urämie, Intoxikation) und hyperchlorämer Subtraktionsazidose mit normaler Lücke (z. B. Diarrhö, renal-tubuläre Azidose).',
        not: 'Der Normbereich hängt vom Labor und der Messmethode ab. Hypoalbuminämie verkleinert die Lücke und kann eine Additionsazidose verdecken – Albumin deshalb eingeben, wenn bekannt.',
      },
      items: [
        num('na', 'Natrium', MMOL, 100, 200, SHARED('na')),
        num('cl', 'Chlorid', MMOL, 50, 160),
        num('hco3', 'Bicarbonat (HCO₃⁻)', MMOL, 1, 60, { hint: 'aus der Blutgasanalyse' }),
        num('alb', 'Albumin', ALB, 0.5, 7, { optional: true, shared: 'alb', hint: 'für die Albuminkorrektur' }),
      ],
      max: null,
      compute(a) {
        return round1(anionGap(a).corrected);
      },
      interpret(total, a) {
        const ag = anionGap(a);
        const base = a.alb !== undefined
          ? { scoreName: 'AG korrigiert', prefix: `Albuminkorrigiert; unkorrigiert ${formatPoints(round1(ag.raw))} mmol/l. ` }
          : { scoreName: 'Anionenlücke', prefix: '' };
        const res = (level, label, text) => ({ scoreName: base.scoreName, level, label, text: base.prefix + text });
        if (total <= 12) {
          if (a.hco3 < 22) return res('mid', 'Normale Anionenlücke', 'Bei erniedrigtem Bicarbonat Hinweis auf eine hyperchloräme (Subtraktions-)Azidose, z. B. Diarrhö, renal-tubuläre Azidose oder große Mengen NaCl 0,9 %.');
          return res('low', 'Normale Anionenlücke', 'Kein Hinweis auf eine Additionsazidose.');
        }
        let text = 'Hinweis auf eine Additionsazidose durch nicht gemessene Anionen – z. B. Laktat, Ketonkörper, Urämie oder Toxine (Methanol, Ethylenglykol, Salicylate).';
        if (a.hco3 < 24) {
          const ratio = (total - 12) / (24 - a.hco3);
          const meaning = ratio < 1 ? 'zusätzlich Subtraktionsazidose wahrscheinlich'
            : ratio <= 2 ? 'reine Additionsazidose wahrscheinlich'
            : 'zusätzlich metabolische Alkalose wahrscheinlich';
          text += ` Delta-Ratio ${formatPoints(round1(ratio))}: ${meaning}.`;
        }
        return res(total >= 20 ? 'high' : 'mid', 'Erhöhte Anionenlücke', text);
      },
      notes: [
        'Berechnung ohne Kalium: Na⁺ − (Cl⁻ + HCO₃⁻). Als Obergrenze sind hier 12 mmol/l angenommen; mit modernen ionenselektiven Messverfahren liegt der Normbereich oft niedriger (etwa 3–11 mmol/l).',
        'Albuminkorrektur nach Figge: + 2,5 mmol/l je 1 g/dl Albumin unter 4,4 g/dl. Delta-Ratio = (AG − 12) / (24 − HCO₃⁻).',
      ],
      related: [
        { id: 'osmo-gap', text: 'Verdacht auf toxische Alkohole: osmotische Lücke', when: (t) => t > 12 },
        { id: 'urin', text: 'Hyperchloräme Azidose: Urin-Anionenlücke', when: (t, a) => t <= 12 && a.hco3 < 22 },
      ],
      sources: [
        { label: 'Emmett M, Narins RG. Clinical use of the anion gap. Medicine (Baltimore) 1977;56(1):38–54', url: 'https://doi.org/10.1097/00005792-197701000-00002' },
        { label: 'Figge J et al. Anion gap and hypoalbuminemia. Crit Care Med 1998;26(11):1807–1810', url: 'https://doi.org/10.1097/00003246-199811000-00019' },
      ],
    },

    {
      id: 'calcium',
      group: 'Niere & Labor',
      short: 'Calcium korr.',
      title: 'Albuminkorrigiertes Calcium',
      subtitle: 'Gesamtcalcium bei erniedrigtem oder erhöhtem Albumin',
      keywords: 'Calcium Kalzium Hypokalzämie Hyperkalzämie Albumin Payne',
      unit: 'mmol/l',
      usage: {
        when: 'Gesamtcalcium bei verändertem Albumin, z. B. bei Intensivpatienten, Leberzirrhose oder nephrotischem Syndrom: abschätzen, ob eine echte Hypo- oder Hyperkalzämie vorliegt, wenn kein ionisiertes Calcium verfügbar ist.',
        not: 'Die Korrektur ist ungenau, besonders bei Intensivpatienten, Niereninsuffizienz und Säure-Basen-Störungen. Wenn möglich das ionisierte Calcium (Blutgasanalyse) messen.',
      },
      items: [
        num('ca', 'Gesamtcalcium', CA, 0.5, 5),
        num('alb', 'Albumin', ALB, 0.5, 7, SHARED('alb')),
      ],
      max: null,
      compute(a) {
        return Math.round((a.ca + 0.2 * (4 - a.alb)) * 100) / 100;
      },
      interpret(total) {
        const mg = `${formatNumber(total / 0.2495, 1)} mg/dl`;
        if (total < 1.9) return { level: 'high', label: 'Schwere Hypokalzämie', text: `Entspricht ${mg}. Gefahr von Tetanie, Krampfanfällen und Herzrhythmusstörungen; ionisiertes Calcium und EKG kontrollieren.` };
        if (total < 2.2) return { level: 'mid', label: 'Hypokalzämie', text: `Entspricht ${mg}. Ionisiertes Calcium bestimmen; Magnesium, Phosphat, Parathormon und Vitamin D prüfen.` };
        if (total <= 2.6) return { level: 'low', label: 'Normal', text: `Entspricht ${mg}. Referenzbereich etwa 2,2–2,6 mmol/l (laborabhängig).` };
        if (total < 3.5) return { level: 'mid', label: 'Hyperkalzämie', text: `Entspricht ${mg}. Häufigste Ursachen: primärer Hyperparathyreoidismus und Malignome; Parathormon bestimmen.` };
        return { level: 'high', label: 'Schwere Hyperkalzämie', text: `Entspricht ${mg}. Gefahr der hyperkalzämischen Krise – Rehydratation, Monitoring, Ursachenabklärung.` };
      },
      notes: [
        'Formel nach Payne: Calcium korrigiert = Calcium + 0,02 × (40 − Albumin in g/l) mmol/l.',
      ],
      sources: [
        { label: 'Payne RB et al. Interpretation of serum calcium in patients with abnormal serum proteins. Br Med J 1973;4(5893):643–646', url: 'https://doi.org/10.1136/bmj.4.5893.643' },
      ],
    },

    {
      id: 'osmo-gap',
      group: 'Niere & Labor',
      short: 'Osmolücke',
      title: 'Osmotische Lücke',
      subtitle: 'Gemessene minus berechnete Serumosmolalität – Hinweis auf toxische Alkohole',
      keywords: 'Osmolalität osmolal gap Methanol Ethylenglykol Isopropanol Intoxikation Vergiftung Alkohol Ethanol',
      unit: 'mosm/kg',
      usage: {
        when: 'Verdacht auf eine Vergiftung mit toxischen Alkoholen (Methanol, Ethylenglykol, Isopropanol), besonders bei unklarer metabolischer Azidose mit erhöhter Anionenlücke. Gemessene Osmolalität und Laborwerte aus derselben Blutentnahme verwenden.',
        not: 'Eine normale Lücke schließt eine Vergiftung nicht aus – spät im Verlauf ist der Alkohol bereits zu sauren Metaboliten abgebaut. Die Osmolalität muss per Gefrierpunktserniedrigung gemessen sein; die Dampfdruckmethode erfasst flüchtige Alkohole nicht.',
      },
      items: [
        num('osm', 'Gemessene Serumosmolalität', [unit('mosm/kg', 1, 0)], 200, 600),
        num('na', 'Natrium', MMOL, 100, 200, SHARED('na')),
        num('glu', 'Glukose', GLU, 10, 2000),
        num('urea', 'Harnstoff', UREA, 5, 600, SHARED('urea')),
        num('etoh', 'Ethanol', ETOH, 0, 1000, { optional: true, hint: 'falls gemessen; sonst erhöht Ethanol die Lücke' }),
      ],
      max: null,
      compute(a) {
        return Math.round((a.osm - osmCalc(a)) * 10) / 10;
      },
      interpret(total, a) {
        const calc = `Berechnete Osmolalität ${formatNumber(osmCalc(a), 0)} mosm/kg (2 × Na + Glukose + Harnstoff${a.etoh !== undefined ? ' + Ethanol' : ''}, je in mmol/l).`;
        if (total <= 10) return { level: 'low', label: 'Keine relevante Lücke', text: `${calc} Eine Vergiftung mit toxischen Alkoholen ist damit nicht sicher ausgeschlossen.` };
        const etoh = a.etoh === undefined ? ' Ethanol ist nicht eingerechnet und kann die Lücke erklären.' : '';
        if (total <= 20) return { level: 'mid', label: 'Erhöhte Lücke', text: `${calc} Nicht gemessene osmotisch wirksame Substanzen: toxische Alkohole, Ethanol, Mannitol, Glycerin; mäßig erhöht auch bei Keto- und Laktatazidose oder Niereninsuffizienz.${etoh}` };
        return { level: 'high', label: 'Deutlich erhöhte Lücke', text: `${calc} Dringender Verdacht auf toxische Alkohole, besonders bei gleichzeitig erhöhter Anionenlücke – Giftinformationszentrum kontaktieren, Antidot (Fomepizol) und Dialyse prüfen.${etoh}` };
      },
      notes: [
        'Normalbereich etwa −2 bis +10 mosm/kg. Umrechnung: Glukose mg/dl ÷ 18, Harnstoff mg/dl ÷ 6, BUN mg/dl ÷ 2,8, Ethanol mg/dl ÷ 4,6.',
      ],
      related: [
        { id: 'anion-gap', text: 'Metabolische Azidose? Anionenlücke berechnen' },
      ],
      sources: [
        { label: 'Kraut JA, Xing SX. Approach to the evaluation of a patient with an increased serum osmolal gap and high-anion-gap metabolic acidosis. Am J Kidney Dis 2011;58(3):480–484', url: 'https://doi.org/10.1053/j.ajkd.2011.05.018' },
      ],
    },

    {
      id: 'sodium',
      group: 'Niere & Labor',
      short: 'Natrium-Korrektur',
      title: 'Natrium-Korrektur',
      subtitle: 'Hypo- und Hypernatriämie: erwartete Änderung des Serum-Natriums pro Liter Infusion (Adrogué-Madias)',
      keywords: 'Natrium Hyponatriämie Hypernatriämie Adrogue Madias NaCl 3 % hyperton Korrektur ODS pontine Myelinolyse',
      unit: 'mmol/l',
      usage: {
        when: 'Hypo- oder Hypernatriämie: abschätzen, wie stark 1 Liter einer Infusionslösung das Serum-Natrium ändert, und die Infusionsmenge für eine angestrebte Änderung planen.',
        not: 'Laufende Verluste und Zufuhren (Urin, Drainagen, Trinkmenge) gehen nicht ein; bei einsetzender Wasserdiurese steigt das Natrium schneller als berechnet. Natrium deshalb engmaschig kontrollieren (anfangs alle 2–4 Stunden). Ersetzt nicht die Ursachenabklärung.',
      },
      items: [
        num('na', 'Serum-Natrium', MMOL, 100, 200, SHARED('na')),
        num('weight', 'Körpergewicht', KG, 1, 300, SHARED('weight')),
        choice('tbw', 'Patient (Anteil des Körperwassers)', [
          pick('Mann < 65 Jahre', { tbw: 0.6, hint: '60 % des Körpergewichts' }),
          pick('Frau < 65 Jahre', { tbw: 0.5, hint: '50 %' }),
          pick('Mann ≥ 65 Jahre', { tbw: 0.5, hint: '50 %' }),
          pick('Frau ≥ 65 Jahre', { tbw: 0.45, hint: '45 %' }),
          pick('Kind', { tbw: 0.6, hint: '60 %' }),
        ]),
        choice('fluid', 'Infusionslösung', [
          pick('NaCl 3 %', { na: 513, hint: '513 mmol/l Natrium' }),
          pick('NaCl 0,9 %', { na: 154, hint: '154 mmol/l' }),
          pick('Ringer-Laktat', { na: 130, k: 4, hint: '130 mmol/l Natrium, 4 mmol/l Kalium' }),
          pick('NaCl 0,45 %', { na: 77, hint: '77 mmol/l' }),
          pick('Glukose 5 %', { na: 0, hint: 'natriumfrei' }),
        ]),
        num('kadd', 'Kaliumzusatz', [unit('mmol/l', 1, 0)], 0, 80, { optional: true, hint: 'mmol Kalium pro Liter Infusionslösung' }),
        num('target', 'Angestrebte Änderung', MMOL, 1, 20, { optional: true, hint: 'Betrag in mmol/l, z. B. 6 – ergibt die nötige Infusionsmenge' }),
      ],
      max: null,
      compute(a) {
        return Math.round(sodiumDelta(a) * 10) / 10;
      },
      interpret(total, a) {
        const tbw = a.weight * a.tbw.tbw;
        const rows = [
          { name: 'Gesamtkörperwasser', value: `${formatNumber(tbw, 1)} l`, note: `${formatNumber(a.weight, 1)} kg × ${formatPoints(a.tbw.tbw)}`, level: 'info' },
          { name: 'Änderung pro Liter', value: `${total > 0 ? '+' : ''}${formatPoints(total)} mmol/l`, note: a.fluid.label, level: 'info' },
        ];
        if (a.target !== undefined && total !== 0) {
          const ml = a.target / Math.abs(total) * 1000;
          rows.push({ name: `Menge für ${formatNumber(a.target, 1)} mmol/l`, value: `${formatNumber(Math.round(ml / 10) * 10, 0)} ml`, note: `${a.fluid.label}; Laufrate je nach Zeitraum festlegen`, level: 'info' });
        }
        const base = { scoreName: 'ΔNa⁺ je Liter' };
        const delta = `Erwartete Änderung: ${total > 0 ? '+' : ''}${formatPoints(total)} mmol/l pro Liter ${a.fluid.label}.`;
        if (a.na < 135) {
          const wrong = total <= 0 ? ' Achtung: Diese Lösung senkt das Natrium bzw. hebt es nicht an.' : '';
          const level = a.na < 125 ? 'high' : 'mid';
          return { ...base, level, rows, label: a.na < 125 ? 'Schwere Hyponatriämie' : 'Hyponatriämie', text: `${delta}${wrong} Korrekturgrenze: höchstens 10 mmol/l in den ersten 24 Stunden, danach höchstens 8 mmol/l pro 24 Stunden; bei hohem Risiko für ein osmotisches Demyelinisierungssyndrom (Alkoholkrankheit, Mangelernährung, Hypokaliämie, Lebererkrankung) vorsichtiger. Bei schweren Symptomen: 150 ml NaCl 3 % über 20 Minuten, bei Bedarf wiederholen.` };
        }
        if (a.na > 145) {
          const wrong = total >= 0 ? ' Achtung: Diese Lösung senkt das Natrium nicht.' : '';
          const level = a.na > 160 ? 'high' : 'mid';
          return { ...base, level, rows, label: a.na > 160 ? 'Schwere Hypernatriämie' : 'Hypernatriämie', text: `${delta}${wrong} Bei chronischer Hypernatriämie (> 48 Stunden) höchstens etwa 10 mmol/l pro 24 Stunden senken, um ein Hirnödem zu vermeiden.` };
        }
        return { ...base, level: 'low', rows, label: 'Normonatriämie', text: delta };
      },
      notes: [
        'Formel: Änderung = (Na Infusion + K Infusion − Na Serum) / (Körperwasser + 1).',
      ],
      sources: [
        { label: 'Adrogué HJ, Madias NE. Hyponatremia. N Engl J Med 2000;342(21):1581–1589', url: 'https://doi.org/10.1056/NEJM200005253422107' },
        { label: 'Adrogué HJ, Madias NE. Hypernatremia. N Engl J Med 2000;342(20):1493–1499', url: 'https://doi.org/10.1056/NEJM200005183422006' },
        { label: 'Spasovski G et al. Clinical practice guideline on diagnosis and treatment of hyponatraemia. Eur J Endocrinol 2014;170(3):G1–G47', url: 'https://doi.org/10.1530/EJE-13-1020' },
      ],
    },

    {
      id: 'perfusor',
      group: 'Medikamente & Infusion',
      short: 'Perfusor',
      title: 'Perfusor-Rechner',
      subtitle: 'Spritzenpumpe: Laufrate (ml/h) aus Dosis (µg/kg/min) – oder umgekehrt',
      keywords: 'Perfusor Spritzenpumpe Laufrate Katecholamine Noradrenalin Arterenol Adrenalin Suprarenin Dobutamin Dopamin µg/kg/min ml/h Dosis',
      unit: '',
      calculator: true,
      usage: {
        when: 'Kontinuierliche Gabe über eine Spritzenpumpe, z. B. von Katecholaminen: Laufrate in ml/h für eine Zieldosis in µg/kg/min berechnen – oder bei der Übergabe die aktuelle Dosis aus der laufenden Rate.',
        not: 'Reine Rechenhilfe: Ersetzt nicht die hausinternen Perfusorstandards und die Doppelkontrolle nach dem Vier-Augen-Prinzip. Nur für gewichtsbezogene Dosierungen in µg/kg/min.',
      },
      items: [
        choice('mode', 'Berechnen', [
          pick('Laufrate aus Dosis', { key: 'rate' }),
          pick('Dosis aus Laufrate', { key: 'dose' }),
        ]),
        choice('syringe', 'Spritze', SYRINGES.map((x) => pick(`${x.drug} ${formatPoints(x.mg)} mg / ${formatPoints(x.ml)} ml`, {
          drug: x.drug, mg: x.mg, ml: x.ml, maxDose: x.maxDose,
          hint: `${formatNumber((x.mg * 1000) / x.ml, 0)} µg/ml`,
        })).concat(pick('Andere Spritze', { key: 'free', hint: 'Menge und Volumen selbst eingeben' })),
        CONFIG.perfusor.confirmed ? 'Hausstandard' : 'Beispielliste – noch nicht an den Hausstandard angepasst'),
        num('mg', 'Wirkstoffmenge in der Spritze', [unit('mg', 1, 2)], 0.01, 2000, { when: (v) => v.syringe === SYRINGES.length }),
        num('ml', 'Gesamtvolumen der Spritze', [unit('ml', 1, 0)], 1, 100, { when: (v) => v.syringe === SYRINGES.length, hint: 'nach Verdünnung, z. B. 50 ml' }),
        num('weight', 'Körpergewicht', KG, 1, 300, SHARED('weight')),
        num('dose', 'Zieldosis', [unit('µg/kg/min', 1, 3)], 0.001, 100, { when: (v) => v.mode === 0 }),
        num('rate', 'Laufrate', [unit('ml/h', 1, 1)], 0.1, 200, { when: (v) => v.mode === 1 }),
      ],
      max: null,
      compute(a) {
        const p = perfusor(a);
        return a.mode.key === 'rate' ? Math.round(p.rate * 10) / 10 : Math.round(p.dose * 1000) / 1000;
      },
      interpret(total, a) {
        const p = perfusor(a);
        const toRate = a.mode.key === 'rate';
        const drug = a.syringe.drug || 'Freie Eingabe';
        const rows = [
          { name: 'Konzentration', value: `${formatNumber(p.conc, p.conc < 10 ? 2 : 0)} µg/ml`, note: `${formatNumber(p.mg, 2)} mg in ${formatNumber(p.ml, 0)} ml`, level: 'info' },
          { name: 'Dosis', value: `${formatNumber(p.dose, 3)} µg/kg/min`, note: `${formatNumber(p.dose * a.weight, 1)} µg/min bei ${formatNumber(a.weight, 1)} kg`, level: 'info' },
          { name: 'Laufrate', value: `${formatNumber(p.rate, 1)} ml/h`, note: `${formatNumber(p.rate * p.conc / 1000, 2)} mg/h`, level: 'info' },
          { name: 'Spritze reicht', value: `${formatNumber(p.ml / p.rate, 1)} h`, note: 'bei gleichbleibender Laufrate', level: 'info' },
        ];
        const high = a.syringe.maxDose !== undefined && p.dose > a.syringe.maxDose;
        const warn = high ? ` Achtung: Die Dosis liegt über ${formatPoints(a.syringe.maxDose)} µg/kg/min und damit außerhalb des üblichen Bereichs für ${drug} – Eingaben prüfen.` : '';
        const preset = a.syringe.key !== 'free' && !CONFIG.perfusor.confirmed
          ? ' Hinweis: Die Spritzenliste ist eine Beispielliste und noch nicht an den Hausstandard angepasst.'
          : '';
        return {
          scoreName: toRate ? 'Laufrate' : 'Dosis',
          unit: toRate ? 'ml/h' : 'µg/kg/min',
          level: high ? 'high' : 'info',
          label: drug,
          rows,
          text: `Laufrate = Dosis × Gewicht × 60 ÷ Konzentration.${warn}${preset} Vor Anwendung mit dem lokalen Perfusorstandard abgleichen und im Vier-Augen-Prinzip prüfen.`,
        };
      },
      sources: [],
    },
  ];

  // Urea in mmol/l: Harnstoff mg/dl ÷ 6,006
  function gbsParts(a) {
    const u = a.urea / 6.006;
    const urea = u < 6.5 ? 0 : u < 8 ? 2 : u < 10 ? 3 : u < 25 ? 4 : 6;
    const hb = a.sex.key === 'm'
      ? (a.hb >= 13 ? 0 : a.hb >= 12 ? 1 : a.hb >= 10 ? 3 : 6)
      : (a.hb >= 12 ? 0 : a.hb >= 10 ? 1 : 6);
    const sbp = a.sbp >= 110 ? 0 : a.sbp >= 100 ? 1 : a.sbp >= 90 ? 2 : 3;
    const other = (a.hr ? 1 : 0) + (a.melena ? 1 : 0) + (a.syncope ? 2 : 0) + (a.liver ? 2 : 0) + (a.chf ? 2 : 0);
    return { urea, hb, sbp, other };
  }

  function news2Parts(a) {
    const onO2 = a.o2.key === 'o2';
    const af = a.af <= 8 ? 3 : a.af <= 11 ? 1 : a.af <= 20 ? 0 : a.af <= 24 ? 2 : 3;
    let spo2;
    if (!a.scale2) spo2 = a.spo2 >= 96 ? 0 : a.spo2 >= 94 ? 1 : a.spo2 >= 92 ? 2 : 3;
    else if (onO2 && a.spo2 >= 97) spo2 = 3;
    else if (onO2 && a.spo2 >= 95) spo2 = 2;
    else if (onO2 && a.spo2 >= 93) spo2 = 1;
    else spo2 = a.spo2 >= 88 ? 0 : a.spo2 >= 86 ? 1 : a.spo2 >= 84 ? 2 : 3;
    const sbp = a.sbp <= 90 ? 3 : a.sbp <= 100 ? 2 : a.sbp <= 110 ? 1 : a.sbp <= 219 ? 0 : 3;
    const hr = a.hr <= 40 ? 3 : a.hr <= 50 ? 1 : a.hr <= 90 ? 0 : a.hr <= 110 ? 1 : a.hr <= 130 ? 2 : 3;
    const temp = a.temp <= 35 ? 3 : a.temp <= 36 ? 1 : a.temp <= 38 ? 0 : a.temp <= 39 ? 1 : 2;
    const parts = { af, spo2, o2: a.o2.points, sbp, hr, cns: a.cns.points, temp };
    parts.red = Object.values(parts).some((v) => v === 3);
    return parts;
  }

  // mmol/l: glucose mg/dl ÷ 18,016, urea mg/dl ÷ 6,006, ethanol mg/dl ÷ 4,607
  function osmCalc(a) {
    return 2 * a.na + a.glu / 18.016 + a.urea / 6.006 + (a.etoh !== undefined ? a.etoh / 4.607 : 0);
  }

  function sodiumDelta(a) {
    const infusate = a.fluid.na + (a.fluid.k || 0) + (a.kadd || 0);
    return (infusate - a.na) / (a.weight * a.tbw.tbw + 1);
  }

  // conc in µg/ml, dose in µg/kg/min, rate in ml/h
  function perfusor(a) {
    const free = a.syringe.key === 'free';
    const mg = free ? a.mg : a.syringe.mg;
    const ml = free ? a.ml : a.syringe.ml;
    const conc = (mg * 1000) / ml;
    if (a.mode.key === 'rate') return { mg, ml, conc, dose: a.dose, rate: (a.dose * a.weight * 60) / conc };
    return { mg, ml, conc, rate: a.rate, dose: (a.rate * conc) / (a.weight * 60) };
  }

  function sofaParts(a) {
    const pf = a.pao2 / (a.fio2 / 100);
    const steps = (v, limits) => limits.filter((l) => v >= l).length;
    const resp = pf < 100 && a.vent ? 4 : pf < 200 && a.vent ? 3 : pf < 300 ? 2 : pf < 400 ? 1 : 0;
    const coag = 4 - steps(a.plt, [20, 50, 100, 150]);
    const liver = steps(a.bili, [1.2, 2, 6, 12]);
    const renal = Math.max(steps(a.crea, [1.2, 2, 3.5, 5]), a.uo.points);
    return { pf, resp, coag, liver, cv: a.cv.points, cns: a.gcs.points, renal };
  }

  // Rows for the urine index table. cls: 'pre' | 'renal' | 'unclear';
  // vote: false when the index is not usable (e.g. under diuretics).
  function urineIndices(a) {
    const LEVEL = { pre: 'low', renal: 'high', unclear: 'mid' };
    const NOTE = { pre: 'prärenal', renal: 'renal (z. B. ATN)', unclear: 'Graubereich' };
    const rows = [];
    const add = (name, value, text, cls, vote, note) => {
      const row = { name, value: text, raw: value, cls, vote };
      row.level = vote ? LEVEL[cls] : 'pending';
      row.note = note || NOTE[cls];
      rows.push(row);
      return row;
    };
    const pct = (v) => `${formatNumber(v, v < 10 ? 2 : 1)} %`;
    const band = (v, preIf, renalIf) => (preIf(v) ? 'pre' : renalIf(v) ? 'renal' : 'unclear');

    const fena = (a.una * a.screa) / (a.sna * a.ucrea) * 100;
    const fenaCls = band(fena, (v) => v < 1, (v) => v > 2);
    const fenaRow = add('FENa', fena, pct(fena), fenaCls, !a.diur,
      a.diur ? 'unter Diuretika nicht verwertbar' : null);

    let feureaRow = null;
    if (a.surea !== undefined && a.uurea !== undefined) {
      const feurea = (a.uurea * a.screa) / (a.surea * a.ucrea) * 100;
      feureaRow = add('FEUrea', feurea, pct(feurea), band(feurea, (v) => v <= 35, (v) => v > 50), true);
    }

    const up = a.ucrea / a.screa;
    add('U/P-Kreatinin', up, formatNumber(up, 0), band(up, (v) => v > 40, (v) => v < 20), true);

    add('Urin-Natrium', a.una, `${formatNumber(a.una, 0)} mmol/l`, band(a.una, (v) => v < 20, (v) => v > 40), !a.diur,
      a.diur ? 'unter Diuretika nicht verwertbar' : null);

    if (a.uosm !== undefined) {
      add('Urin-Osmolalität', a.uosm, `${formatNumber(a.uosm, 0)} mosm/kg`, band(a.uosm, (v) => v > 500, (v) => v < 350), true);
    }

    if (a.surea !== undefined) {
      const ratio = (a.surea / 2.14) / a.screa;
      add('BUN/Kreatinin', ratio, formatNumber(ratio, 0), band(ratio, (v) => v > 20, (v) => v < 15), true);
    }

    if (a.uk !== undefined && a.ucl !== undefined) {
      const uag = a.una + a.uk - a.ucl;
      const note = a.una < 20 ? 'bei Urin-Natrium < 20 mmol/l nicht verwertbar'
        : uag < 0 ? 'negativ: renale NH₄⁺-Ausscheidung erhalten – extrarenaler Bicarbonatverlust (z. B. Diarrhö) wahrscheinlich'
        : uag > 0 ? 'positiv: verminderte renale NH₄⁺-Ausscheidung – renal-tubuläre Azidose (distal oder Typ 4) möglich'
        : 'neutral: nicht eindeutig';
      // Not part of the prerenal/renal vote; it answers a different question.
      const row = add('Urin-Anionenlücke', uag, `${formatPoints(round1(uag))} mmol/l`, 'unclear', false, note);
      row.level = a.una < 20 ? 'pending' : 'mid';
    }

    const primary = a.diur && feureaRow ? feureaRow : fenaRow;
    return { rows, primary };
  }

  // AKIN stage from the creatinine rise alone. Ratio and difference are rounded
  // so that e.g. 1,8 / 0,9 counts as exactly twice the baseline (stage 1).
  function akinCreaStage(a) {
    const ratio = Math.round((a.crea / a.base) * 1000) / 1000;
    const diff = Math.round((a.crea - a.base) * 1000) / 1000;
    if (ratio > 3 || (a.crea >= 4 && diff >= 0.5)) return 3;
    if (ratio > 2) return 2;
    if (ratio >= 1.5 || diff >= 0.3) return 1;
    return 0;
  }

  function anionGap(a) {
    const raw = a.na - a.cl - a.hco3;
    return { raw, corrected: a.alb !== undefined ? raw + 2.5 * (4.4 - a.alb) : raw };
  }

  function round1(n) {
    return Math.round(n * 10) / 10;
  }

  SCORES.forEach((s) => {
    if ('max' in s) return;
    s.max = s.items.reduce((sum, item) => sum + (item.type === 'bool' ? Math.max(0, item.points || 0)
      : item.type === 'choice' ? Math.max(...item.options.map((o) => o.points || 0))
      : 0), 0);
  });

  // Items currently part of the form: headings carry no value and `when`
  // hides inputs that do not apply (e.g. dose vs. rate in the pump calculator).
  function activeItems(score, values) {
    return score.items.filter((item) => item.type !== 'heading' && (!item.when || item.when(values)));
  }

  // values: { [itemId]: true/false for bool items, option index for choice
  // items, number in the canonical unit for number items }
  function evaluate(score, values) {
    let sum = 0;
    const missing = [];
    const untestable = [];
    const answers = {};
    activeItems(score, values).forEach((item) => {
      const v = values[item.id];
      if (item.type === 'bool') {
        answers[item.id] = !!v;
        if (v && item.points) sum += item.points;
      } else if (item.type === 'number') {
        if (typeof v === 'number' && isFinite(v)) answers[item.id] = v;
        else if (!item.optional) missing.push(item);
      } else if (v === undefined || v === null) {
        missing.push(item);
      } else {
        const o = item.options[v];
        answers[item.id] = o;
        if (o.points) sum += o.points;
        if (o.untestable) untestable.push(item);
      }
    });
    const complete = missing.length === 0;
    const total = score.compute ? (complete ? score.compute(answers) : null) : sum;
    const result = complete ? score.interpret(total, answers) : null;
    return {
      total,
      max: result && result.max !== undefined ? result.max : score.max,
      unit: result && result.unit !== undefined ? result.unit : score.unit,
      name: (result && result.scoreName) || score.short,
      complete,
      missing,
      untestable,
      result,
    };
  }

  // "5/10 Punkte", "92 ml/min/1,73 m²", "1,2" – or null for rules, whose
  // result is the label alone.
  function totalText(score, r) {
    if (score.rule || r.total === null) return null;
    const n = formatPoints(r.total);
    if (r.unit !== undefined) return r.unit ? `${n} ${r.unit}` : n;
    return r.max !== null ? `${n}/${formatPoints(r.max)} Punkte` : `${n} Punkte`;
  }

  function formatPoints(n) {
    return String(n).replace('.', ',').replace('-', '−');
  }

  function formatNumber(n, decimals) {
    return formatPoints(Number(n.toFixed(decimals)));
  }

  function signed(points) {
    return (points > 0 ? '+' : '') + formatPoints(points);
  }

  // Plain-text result for pasting into a chart or discharge letter.
  function summaryText(score, values) {
    const r = evaluate(score, values);
    if (!r.complete) return null;
    const total = totalText(score, r);
    const lines = [total === null ? `${r.name}: ${r.result.label}` : `${r.name}: ${total} – ${r.result.label}`];
    (r.result.rows || []).forEach((row) => lines.push(`${row.name}: ${row.value} – ${row.note}`));
    if (r.result.rows) lines.push('Werte:');
    const met = [];
    let hasCriteria = false;
    activeItems(score, values).forEach((item) => {
      const v = values[item.id];
      if (item.type === 'bool' && item.points !== undefined) {
        hasCriteria = true;
        if (v) met.push(`${item.label} (${signed(item.points)})`);
      } else if (item.type === 'bool') {
        lines.push(`${item.label}: ${v ? 'ja' : 'nein'}`);
      } else if (item.type === 'choice') {
        const o = item.options[v];
        const pts = o.points !== undefined && !o.untestable ? ` (${formatPoints(o.points)})` : '';
        lines.push(`${item.label}: ${o.label}${pts}`);
      } else if (typeof v === 'number') {
        const u = item.units[0];
        lines.push(`${item.label}: ${formatNumber(v, u ? u.decimals : 2)}${u ? ' ' + u.label : ''}`);
      }
    });
    if (hasCriteria) lines.splice(1, 0, 'Erfüllt: ' + (met.length ? met.join(', ') : 'keine Kriterien'));
    return lines.join('\n');
  }

  const api = { SCORES, GROUPS, evaluate, activeItems, totalText, formatPoints, formatNumber, summaryText };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.KlinikScores = api;
})(this);
