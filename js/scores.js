// Score definitions and evaluation. No DOM access, so the same file runs in
// the browser (window.KlinikScores) and under Node for the tests.
(function (root) {
  'use strict';

  const bool = (id, label, points, hint) => ({ id, type: 'bool', label, points, hint });
  const choice = (id, label, options, hint) => ({ id, type: 'choice', label, options, hint });
  const opt = (points, label, extra) => Object.assign({ points, label }, extra);
  const UN = (label) => opt(0, label, { key: 'UN', untestable: true });

  const SCORES = [
    {
      id: 'qsofa',
      short: 'qSOFA',
      title: 'qSOFA',
      subtitle: 'Sepsis-3: Risiko für einen ungünstigen Verlauf bei Infektverdacht',
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
      notes: [
        'qSOFA ist kein Screening-Instrument: Die Surviving Sepsis Campaign 2021 rät davon ab, qSOFA allein zum Sepsis-Screening einzusetzen.',
      ],
      sources: [
        { label: 'Seymour CW et al. Assessment of Clinical Criteria for Sepsis. JAMA 2016;315(8):762–774', url: 'https://doi.org/10.1001/jama.2016.0288' },
        { label: 'Singer M et al. Sepsis-3. JAMA 2016;315(8):801–810', url: 'https://doi.org/10.1001/jama.2016.0287' },
      ],
    },

    {
      id: 'curb65',
      short: 'CURB-65',
      title: 'CURB-65',
      subtitle: 'Ambulant erworbene Pneumonie: Schweregrad und Behandlungsort',
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
      id: 'heart',
      short: 'HEART',
      title: 'HEART-Score',
      subtitle: 'Brustschmerz in der Notaufnahme: Risiko für ein schweres kardiales Ereignis (MACE) in 6 Wochen',
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
      notes: [
        'Nicht anwendbar bei STEMI – dieser wird unabhängig vom Score behandelt.',
      ],
      sources: [
        { label: 'Six AJ, Backus BE, Kelder JC. Chest pain in the emergency room: value of the HEART score. Neth Heart J 2008;16(6):191–196', url: 'https://doi.org/10.1007/BF03086144' },
        { label: 'Backus BE et al. A prospective validation of the HEART score. Int J Cardiol 2013;168(3):2153–2158', url: 'https://doi.org/10.1016/j.ijcard.2013.01.255' },
      ],
    },

    {
      id: 'wells-le',
      short: 'Wells LE',
      title: 'Wells-Score Lungenembolie',
      subtitle: 'Klinische Wahrscheinlichkeit einer Lungenembolie',
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
        'Bei hämodynamisch instabilen Patienten nicht anwenden – dort direkt Bildgebung bzw. Echokardiographie.',
      ],
      sources: [
        { label: 'Wells PS et al. Derivation of a simple clinical model to categorize patients probability of pulmonary embolism. Thromb Haemost 2000;83(3):416–420', url: 'https://doi.org/10.1055/s-0037-1613830' },
      ],
    },

    {
      id: 'wells-tvt',
      short: 'Wells TVT',
      title: 'Wells-Score Beinvenenthrombose',
      subtitle: 'Klinische Wahrscheinlichkeit einer tiefen Venenthrombose',
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
      short: 'NIHSS',
      title: 'NIH Stroke Scale',
      subtitle: 'Schweregrad des akuten Schlaganfalls (0–42 Punkte)',
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
  ];

  SCORES.forEach((s) => {
    s.max = s.items.reduce((sum, item) => sum + (item.type === 'bool'
      ? Math.max(0, item.points)
      : Math.max(...item.options.map((o) => o.points))), 0);
  });

  // values: { [itemId]: true/false for bool items, option index for choice items }
  function evaluate(score, values) {
    let total = 0;
    const missing = [];
    const untestable = [];
    const chosen = {};
    score.items.forEach((item) => {
      const v = values[item.id];
      if (item.type === 'bool') {
        if (v) total += item.points;
      } else if (v === undefined || v === null) {
        missing.push(item);
      } else {
        const o = item.options[v];
        chosen[item.id] = o;
        total += o.points;
        if (o.untestable) untestable.push(item);
      }
    });
    const complete = missing.length === 0;
    const result = complete ? score.interpret(total, chosen) : null;
    return {
      total,
      max: (result && result.max) || score.max,
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

  const api = { SCORES, evaluate, formatPoints };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.KlinikScores = api;
})(this);
