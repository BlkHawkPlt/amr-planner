// The ORIGINAL (workbook-faithful) Calls-sheet text generator, kept only so compare_workbook.py can prove the model still matches the workbook.
// The app itself uses site/js/scripts.js (AWOS/ASOS aware, fully filled).
module.exports = function (M) { const s = M.s, num = M.num;
  /* ---------- Calls sheet + Grade Sheet text ---------- */
  M.calls = function (m, env) {
    const ser = M.serNum(m, env), sn = M.last5(ser);
    const D = m.dep, A = m.d1, B = m.d2, DN = M.aname(D, env), AN = M.aname(A, env), BN = M.aname(B, env);
    const ls = (x) => M.landingSentence(x.apr, x.rwy, env);
    const out = { sn, ser };
    out.depWx = {
      ATIS: DN + ' Airport Info ______, ______Z.  Wind ' + D.wind + ' @ ' + D.ws + '. Vis ' + D.vis + ', Ceiling ' + D.ceil + ' ' + D.ct + '. Temp ' + D.temp + ' / DP ' + D.dp + '. Altimeter ' + D.altim + '  ' + D.apr + ' in use. ' + ls(D) + ' Advise on initial contact you have _____.',
      ASOS: DN + ' Airport Automated Observation _______Z.  Wind ' + D.wind + ' @ ' + D.ws + '. VIS ' + D.vis + '. Sky Condition ' + D.ct + ' Ceiling ' + D.ceil + ' Temp ' + D.temp + 'C / DP ' + D.dp + 'C. Altimeter ' + D.altim,
      AWOS: DN + ' Airport Automated Weather Observation _______Z.  Wind ' + D.wind + '@' + D.ws + ' VIS ' + D.vis + '. Sky Condition ' + D.ct + ' Ceiling ' + D.ceil + ' Temp ' + D.temp + 'C / DP ' + D.dp + 'C.  Altimeter ' + D.altim
    };
    out.depCd = {
      ATC: 'Army Copter ' + sn + ' Cleared to ' + AN + ' Airport ' + (D.sid === '' ? ' as filed.' : ' via ' + D.sid + ' departure, ' + D.trans + '_Transition, then as filed.') +
           ' Climb and Maintain ' + D.maint + '_,' + (D.exp === '' ? '' : ' Expect ' + D.exp + ', ' + D.min + ' minutes after departure. ') + (D.sid === '' ? '. Dept Freq ______.  SQK _______.' : ' SQK ___________ .'),
      RELAY: 'ATC clears Army Copter ' + sn + ' to depart ' + DN + ' to ' + AN + ' as filed. Maintain ' + D.maint + (D.exp === '' ? '' : ' Expect ' + D.exp + ', ' + D.min + ' minutes after departure') +
             '. Dept Freq ______.  SQK _______.  Clearance Void if not off by__________,.  If not off by_______advise ____________NLT ________of intentions.  Time________ and ______(qtr).'
    };
    out.d1Wx = {
      ATIS: AN + ' Airport Info ______, ______Z.  Wind ' + A.wind + ' @ ' + A.ws + '. Vis ' + A.vis + ', Ceiling ' + A.ceil + ' ' + A.ct + '. Temp ' + A.temp + ' / DP ' + A.dp + '. Altimeter ' + A.altim + ', ' + A.apr + ' in use.  ' + ls(A) + ' Advise on initial contact you have _____.',
      ASOS: AN + ' Airport Automated Observation _______Z.  Wind ' + A.wind + ' @ ' + A.ws + '. VIS ' + A.vis + '. Sky Condition ' + A.ct + ' Ceiling ' + A.ceil + ' Temp ' + A.temp + 'C / DP ' + A.dp + 'C.  Altimeter ' + A.altim,
      AWOS: AN + ' Airport Automated Weather Observation _______Z.  Wind ' + A.wind + ' @ ' + A.ws + ' VIS ' + A.vis + '. Sky Condition ' + A.ct + ' Ceiling ' + A.ceil + ' Temp ' + A.temp + 'C / DP ' + A.dp + 'C.  Altimeter ' + A.altim
    };
    out.d2Wx = {
      ATIS: BN + ' Airport Info ______, ______Z.  Wind ' + B.wind + ' @ ' + B.ws + '. Vis ' + B.vis + ', Ceiling ' + B.ceil + ' ' + B.ct + '. Temp ' + B.temp + ' / DP ' + B.dp + '. Altimeter ' + B.altim + ',  ' + B.apr + ' in use. ' + ls(B) + ' Advise on initial contact you have _____.',
      ASOS: BN + ' Airport Automated Observation _______Z.  Wind ' + B.wind + ' @ ' + B.ws + '. VIS ' + B.vis + '. Sky Condition ' + B.ct + ' Ceiling ' + B.ceil + ' Temp ' + B.temp + 'C / DP ' + B.dp + 'C. Altimeter ' + B.altim,
      AWOS: BN + ' Airport Automated Weather Observation _______Z.  Wind ' + B.wind + ' @ ' + B.ws + ' VIS ' + B.vis + '. Sky Condition ' + B.ct + ' Ceiling ' + B.ceil + ' Temp ' + B.temp + 'C / DP ' + B.dp + 'C.  Altimeter ' + B.altim
    };
    const ac1 = {
      'NON RNAV Pub Rte': 'Army Copter ' + sn + ' Cleared ' + A.apr + ' approach.        (And possibly ONLY at Towered Airfields), Circle To Runway ________.',
      'NON RNAV  Unpub RTE': 'Army Copter ' + sn + ', Cross ______at or above________.  Cleared ' + A.apr + ' approach.',
      'RNAV within TAA': 'Army Copter ' + sn + ' Cleared ' + A.apr + ' approach.',
      'RNAV outside TAA': 'Army Copter ' + sn + ', Cleared Direct _____(IAF).  Maintain at or above______until entering the TAA.  Cleared ' + A.apr + ' approach.',
      'RNAV No TAA': 'Army Copter ' + sn + ', Cleared Direct _____(IAF).  Maintain at or above______until ______ (IAF). Cleared ' + A.apr + ' approach.',
      'Vector Non RNAV': 'Army Copter ' + sn + ',______ miles from________.  Turn L/R, Heading_____.  Maintaing______until established on the (LOC, Final APP Course).  Cleared ' + A.apr + ' approach.',
      'Vector RNAV w/in TAA': 'Army Copter ' + sn + ',_____ miles from ______(IAF).  Cleared ' + A.apr + ' approach.',
      'Vector RNAV no TAA': 'Army Copter ' + sn + ',______ Miles from _____(IAF).  Cleared Direct_______(IAF).  Cross________(IAF) at or above_______.  Cleared ' + A.apr + ' approach.'
    };
    const ac2 = {
      'NON RNAV Pub Rte': 'Army Copter ' + sn + ', Cleared ' + B.apr + ' approach.',
      'NON RNAV  Unpub RTE': 'Army Copter ' + sn + ', Cross ______at or above________.  Cleared ' + B.apr + ' approach.',
      'RNAV within TAA': 'Army Copter ' + sn + ', Cleared  ' + B.apr + ' approach.',
      'RNAV outside TAA': 'Army Copter ' + sn + ', Cleared Direct _____(IAF).  Maintain at or above______until entering the TAA.  Cleared ' + B.apr + ' approach.',
      'RNAV No TAA': 'Army Copter ' + sn + ', Cleared Direct _____(IAF).  Maintain at or above______until ______ (IAF). Cleared ' + B.apr + ' approach.',
      'Vector Non RNAV': 'Army Copter ' + sn + ', __ miles from________.  Turn L/R, Heading_____.  Maintain______until established on the (LOC, Final APP Coiurse). Cleared ' + B.apr + ' approach.',
      'Vector RNAV w/in TAA': 'Army Copter ' + sn + ', __ miles from ______(IAF).  Cleared ' + B.apr + ' approach.',
      'Vector RNAV no TAA': 'Army Copter ' + sn + ', __ Miles from _____(IAF).  Cleared Direct_______(IAF).  Cross________(IAF) at or above_______.  Cleared ' + B.apr + ' approach.'
    };
    out.d1Clr = ac1; out.d2Clr = ac2;
    // Grade Sheet ---------------------------------------------------------------------------
    const g = out.grade = {};
    g.depWx = out.depWx[D.wx] || '';
    g.cd = out.depCd[D.cd] || '';
    g.taxi = 'Army Copter ' + sn + ', RWY _____' + D.rwy + ', Hover Taxi via _________.';
    g.takeoff = 'Army Copter ' + sn + ', RWY ' + D.rwy + ' (MIL ATC: Wind ' + D.wind + ' @ ' + D.ws + ' ) Cleared for Takeoff.';
    g.handoff1 = 'Army Copter ' + sn + ', CONTACT DEPARTURE ';
    g.depCtl = 'Army Copter ' + sn + ', ____________ Dep ,  RADAR CONTACT, Climb and Maintain _______, _________ altimeter is ____________.';
    g.contact = 'Army Copter ' + sn + ' CONTACT ___________ (APP/CTR) ON _________';
    g.d1Wx = out.d1Wx[A.wx] || '';
    g.d1Info = 'Army Copter ' + sn + ', Expect ' + A.apr + ' approach.  Wind ' + A.wind + ' @ ' + A.ws + ' Ceiling ' + A.ceil + ' ' + A.ct + ' Vis ' + A.vis + ' Altimeter ' + A.altim + '.';
    g.d1Clr = ac1[A.ac] || '';
    g.d1Cross = 'Army Copter ' + sn + ', Cross ______ at or above ________, Cleared ' + A.apr + ' Approach';
    g.d1Cancel = 'Army Copter ' + sn + ', Report cancellation of IFR this freq or with FSS(Name if known).  Change to advisory freq approved.';
    g.d1Tower = 'Contact Tower on ________(freq).  (Then when on Tower:) Army Copter ' + sn + ', ' + AN + ' Tower,  RWY ' + A.rwy + ' (MIL ATC: Wind ' + A.wind + ' @ ' + A.ws + ' ), Cleared to Land.';
    g.missed1 = 'Army Copter ' + sn + ', CONTACT ______________ APP CON ON ______.';
    g.missed2 = 'Army Copter ' + sn + ', _______________ App, RADAR Contact, Climb and Maintain ________, Say Intentions';
    g.missed3 = 'Army Copter ' + sn + ', I Have your Request, EXPECT FURTHER CLEARANCE ________.';
    g.toD2 = 'Army Copter ' + sn + ', Cleared to ' + BN + ' Airport, (VIA or DIRECT)  ________________(routing), Maintain 4000.';
    g.handoff2 = 'Army Copter ' + sn + ', CONTACT _________________ on __________ ';
    g.d2Wx = out.d2Wx[B.wx] || '';
    g.d2Info = 'Army Copter ' + sn + ', Expect ' + B.apr + ' approach.  Wind ' + B.wind + ' @ ' + B.ws + ' Ceiling ' + B.ceil + ' ' + B.ct + ' Vis ' + B.vis + ' Altimeter ' + B.altim + '.';
    g.d2Clr = ac2[B.ac] || '';
    g.d2Cross = 'Army Copter ' + sn + ', Cross __(fix)__ at or above __(alt)__, Cleared ' + B.apr + ' Approach';
    g.d2Cancel = g.d1Cancel.replace('Army Copter ' + sn + ', ', 'Army Copter ' + sn + ', ');
    g.d2ContactTwr = 'Army Copter ' + sn + ', Contact Tower on ___________(freq).';
    g.d2Tower = 'Army Copter ' + sn + ', ' + BN + ' TOWER, RWY ' + B.rwy + ' (MIL: WIND ' + B.wind + ' @ ' + B.ws + ') CLEARED TO LAND';
    g.simTemp = 'Temperature in Fahrenheit for SIM setup = ' + s(M.fToC(D.temp)) + '*';
    g.cockpit = 'COCKPIT # __' + m.device + '__';
    return out;
  };

};
