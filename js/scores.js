// Score definitions and evaluation. No DOM access, so the same file runs in
// the browser (window.KlinikScores) and under Node for the tests.
(function (root) {
  'use strict';

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

  const CREA = [unit('mg/dl', 1, 2), unit('µmol/l', 1 / 88.4, 0)];
  const BILI = [unit('mg/dl', 1, 2), unit('µmol/l', 1 / 17.1, 0)];
  const ALB = [unit('g/dl', 1, 1), unit('g/l', 0.1, 0)];
  const MMOL = [unit('mmol/l', 1, 1)];
  const UCREA = [unit('mg/dl', 1, 1), unit('µmol/l', 1 / 88.4, 0), unit('mmol/l', 1000 / 88.4, 2)];
  // Canonical: urea (Harnstoff) in mg/dl; BUN × 2,14 = Harnstoff.
  const UREA = [unit('mg/dl', 1, 0), unit('mmol/l', 6.006, 1), unit('BUN mg/dl', 2.14, 0)];

  const GROUPS = [
    'Notfall & Intensiv',
    'Infektionen',
    'Kardiologie',
    'Thrombose & Embolie',
    'Neurologie',
    'Leber',
    'Niere & Labor',
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
        num('plt', 'Thrombozyten', [unit('/nl', 1, 0)], 0, 2000, { hint: '/nl = 10³/µl' }),
        num('bili', 'Bilirubin', BILI, 0, 70),
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
        num('crea', 'Kreatinin', CREA, 0.1, 30),
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
      sources: [
        { label: 'Teasdale G, Jennett B. Assessment of coma and impaired consciousness. A practical scale. Lancet 1974;2(7872):81–84', url: 'https://doi.org/10.1016/S0140-6736(74)91639-0' },
        { label: 'Teasdale G et al. The Glasgow Coma Scale at 40 years: standing the test of time. Lancet Neurol 2014;13(8):844–854', url: 'https://doi.org/10.1016/S1474-4422(14)70120-6' },
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
      sources: [
        { label: 'Pisters R et al. A novel user-friendly score (HAS-BLED) to assess 1-year risk of major bleeding in patients with atrial fibrillation. Chest 2010;138(5):1093–1100', url: 'https://doi.org/10.1378/chest.10-0134' },
        { label: 'Van Gelder IC et al. 2024 ESC Guidelines for the management of atrial fibrillation. Eur Heart J 2024;45(36):3314–3414', url: 'https://doi.org/10.1093/eurheartj/ehae176' },
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
      ],
      interpret(total) {
        const tier = total < 2 ? 'niedrig' : total <= 6 ? 'mittel' : 'hoch';
        if (total <= 4) {
          return { level: 'low', label: 'LE unwahrscheinlich', text: `D-Dimer bestimmen; ist es negativ, ist eine Lungenembolie weitgehend ausgeschlossen. Ist es positiv: CT-Pulmonalisangiographie. Dreistufig: Wahrscheinlichkeit ${tier}.` };
        }
        return { level: 'high', label: 'LE wahrscheinlich', text: `CT-Pulmonalisangiographie; D-Dimer ist hier nicht zum Ausschluss geeignet. Dreistufig: Wahrscheinlichkeit ${tier}.` };
      },
      notes: [
        'Zweistufig: ≤ 4 unwahrscheinlich, > 4 wahrscheinlich. Dreistufig: < 2 niedrig, 2–6 mittel, > 6 hoch.',
      ],
      sources: [
        { label: 'Wells PS et al. Derivation of a simple clinical model to categorize patients probability of pulmonary embolism. Thromb Haemost 2000;83(3):416–420', url: 'https://doi.org/10.1055/s-0037-1613830' },
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
      sources: [
        { label: 'Johnston SC et al. Validation and refinement of scores to predict very early stroke risk after transient ischaemic attack. Lancet 2007;369(9558):283–292', url: 'https://doi.org/10.1016/S0140-6736(07)60150-0' },
      ],
    },

    {
      id: 'child-pugh',
      group: 'Leber',
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
      sources: [
        { label: 'Pugh RN et al. Transection of the oesophagus for bleeding oesophageal varices. Br J Surg 1973;60(8):646–649', url: 'https://doi.org/10.1002/bjs.1800600817' },
      ],
    },

    {
      id: 'meld',
      group: 'Leber',
      short: 'MELD',
      title: 'MELD-Score',
      subtitle: 'Model for End-Stage Liver Disease: 3-Monats-Letalität bei fortgeschrittener Lebererkrankung (6–40)',
      keywords: 'Leber Zirrhose Lebertransplantation labMELD Eurotransplant',
      usage: {
        when: 'Fortgeschrittene chronische Lebererkrankung – objektive Abschätzung der 3-Monats-Letalität, z. B. vor TIPS oder größeren Operationen. In der Eurotransplant-Region Grundlage der Organallokation für Lebertransplantationen (labMELD).',
        not: 'Unter Vitamin-K-Antagonisten ist der INR nicht verwertbar. Hyponatriämie verschlechtert die Prognose zusätzlich (MELD-Na); bei bestimmten Erkrankungen wie HCC bildet der labMELD die Dringlichkeit nicht ab (Standard-Exceptions).',
      },
      items: [
        num('bili', 'Bilirubin', BILI, 0.1, 70),
        num('inr', 'INR', [], 0.5, 20),
        num('crea', 'Kreatinin', CREA, 0.1, 30),
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
        num('crea', 'Serumkreatinin', CREA, 0.1, 30, { hint: 'enzymatisch bzw. IDMS-standardisiert' }),
        num('age', 'Alter', [unit('Jahre', 1, 0)], 18, 120),
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
      sources: [
        { label: 'Inker LA et al. New creatinine- and cystatin C-based equations to estimate GFR without race. N Engl J Med 2021;385:1737–1749', url: 'https://doi.org/10.1056/NEJMoa2102953' },
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
        num('sna', 'Serum-Natrium', MMOL, 100, 200),
        num('screa', 'Serum-Kreatinin', CREA, 0.1, 30),
        num('surea', 'Serum-Harnstoff', UREA, 5, 600, { optional: true, hint: 'für FEUrea und BUN/Kreatinin' }),
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
        num('na', 'Natrium', MMOL, 100, 200),
        num('cl', 'Chlorid', MMOL, 50, 160),
        num('hco3', 'Bicarbonat (HCO₃⁻)', MMOL, 1, 60, { hint: 'aus der Blutgasanalyse' }),
        num('alb', 'Albumin', ALB, 0.5, 7, { optional: true, hint: 'für die Albuminkorrektur' }),
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
      sources: [
        { label: 'Emmett M, Narins RG. Clinical use of the anion gap. Medicine (Baltimore) 1977;56(1):38–54', url: 'https://doi.org/10.1097/00005792-197701000-00002' },
        { label: 'Figge J et al. Anion gap and hypoalbuminemia. Crit Care Med 1998;26(11):1807–1810', url: 'https://doi.org/10.1097/00003246-199811000-00019' },
      ],
    },
  ];

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

  function anionGap(a) {
    const raw = a.na - a.cl - a.hco3;
    return { raw, corrected: a.alb !== undefined ? raw + 2.5 * (4.4 - a.alb) : raw };
  }

  function round1(n) {
    return Math.round(n * 10) / 10;
  }

  SCORES.forEach((s) => {
    if ('max' in s) return;
    s.max = s.items.reduce((sum, item) => sum + (item.type === 'bool'
      ? Math.max(0, item.points)
      : Math.max(...item.options.map((o) => o.points))), 0);
  });

  // values: { [itemId]: true/false for bool items, option index for choice
  // items, number in the canonical unit for number items }
  function evaluate(score, values) {
    let sum = 0;
    const missing = [];
    const untestable = [];
    const answers = {};
    score.items.forEach((item) => {
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
      name: (result && result.scoreName) || score.short,
      complete,
      missing,
      untestable,
      result,
    };
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
    const total = score.unit ? `${formatPoints(r.total)} ${score.unit}`
      : r.max !== null ? `${formatPoints(r.total)}/${formatPoints(r.max)} Punkte`
      : `${formatPoints(r.total)} Punkte`;
    const lines = [`${r.name}: ${total} – ${r.result.label}`];
    (r.result.rows || []).forEach((row) => lines.push(`${row.name}: ${row.value} – ${row.note}`));
    if (r.result.rows) lines.push('Werte:');
    const met = [];
    let hasCriteria = false;
    score.items.forEach((item) => {
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

  const api = { SCORES, GROUPS, evaluate, formatPoints, formatNumber, summaryText };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.KlinikScores = api;
})(this);
