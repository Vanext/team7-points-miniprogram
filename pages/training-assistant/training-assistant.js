Page({
  data: {
    today: '',
    currentSub: 'swim',
    // 游泳
    swimT200: '',
    swimT400: '',
    swimT200M: '',
    swimT200S: '',
    swimT400M: '',
    swimT400S: '',
    swimMethodOptions: ['CSS(200/400)','1000m TT'],
    swimMethodIndex: 0,
    swimT1000M: '',
    swimT1000S: '',
    swimPace100: '',
    swimZones: [],
    swimCalculated: false,
    swimPredLevels: ['精英/高水平','训练良好','入门/提高'],
    swimPredLevelIndex: 1,
    swimThermalSuit: false,
    swimDrafting: false,
    swimWaterOptions: ['平静','中等浪','碎浪/顶流'],
    swimWaterIndex: 0,
    swimPredItems: [],
    // 骑行
    bikeFTP: '',
    bikeLT1: 0,
    bikeLT2: 0,
    bikeZones: [],
    bikeCalculated: false,
    bikePredSpeed: '',
    bikePredTime40k: '',
    bikePredAvgPower: '',
    bikePreds: [],
    bikeIFs: { d20: 0.95, d40: 0.90, d90: 0.80, d180: 0.72 },
    bikeIFValue: { d20: 95, d40: 90, d90: 80, d180: 72 },
    bikeIFPct: { d20: '95%', d40: '90%', d90: '80%', d180: '72%' },
    showBikeNote: false,
    // 跑步
    runSources: [ { value: '10k', name: '10公里' }, { value: 'hm', name: '半马' }, { value: 'fm', name: '马拉松' } ],
    runSourceIndex: 0,
    runBestTime: '',
    runBestH: '',
    runBestM: '',
    runBestS: '',
    runTPace: '',
    runLT1Pace: '',
    runZones: [],
    runCalculated: false,
    runPredItems: []
  },

  onLoad() {
    const d = new Date();
    const s = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    this.setData({ today: s });
    // 保护：下拉选项为空时回填默认
    if (!this.data.swimMethodOptions || this.data.swimMethodOptions.length === 0) {
      this.setData({ swimMethodOptions: ['CSS(200/400)','1000m TT'], swimMethodIndex: 0 });
    }
  },
  onShow(){ 
    // try { const app = getApp(); app.recordVisit('tools', 'pages/training-assistant/training-assistant') } catch (_) {} 
  },

  switchSub(e) { this.setData({ currentSub: e.currentTarget.dataset.sub }); },

  // ===== 游泳 CSS =====
  onSwimT200(e){ this.setData({ swimT200: e.detail.value, swimCalculated: false }); },
  onSwimT400(e){ this.setData({ swimT400: e.detail.value, swimCalculated: false }); },
  onSwimT200M(e){ this.setData({ swimT200M: e.detail.value, swimCalculated: false }); },
  onSwimT200S(e){ this.setData({ swimT200S: e.detail.value, swimCalculated: false }); },
  onSwimT400M(e){ this.setData({ swimT400M: e.detail.value, swimCalculated: false }); },
  onSwimT400S(e){ this.setData({ swimT400S: e.detail.value, swimCalculated: false }); },
  calculateSwim(){
    let v = 0; // m/s
    if (this.data.swimMethodIndex == 0) {
      let t200, t400;
      const hasSeg200 = (this.data.swimT200M !== '' || this.data.swimT200S !== '');
      const hasSeg400 = (this.data.swimT400M !== '' || this.data.swimT400S !== '');
      if (hasSeg200) {
        let m200 = Number(this.data.swimT200M);
        let s200 = Number(this.data.swimT200S);
        if (!isFinite(m200)) m200 = 0;
        if (!isFinite(s200)) s200 = 0;
        t200 = m200 * 60 + s200;
      } else {
        t200 = this.parseTimeToSeconds(this.data.swimT200);
      }
      if (hasSeg400) {
        let m400 = Number(this.data.swimT400M);
        let s400 = Number(this.data.swimT400S);
        if (!isFinite(m400)) m400 = 0;
        if (!isFinite(s400)) m400 = 0;
        if (!isFinite(s400)) s400 = 0;
        t400 = m400 * 60 + s400;
      } else {
        t400 = this.parseTimeToSeconds(this.data.swimT400);
      }
      if(!t200 || !t400 || t400<=t200){ wx.showToast({ title:'请输入有效成绩', icon:'none' }); return; }
      v = (400-200)/(t400-t200);
    } else {
      // 1000m TT 方法
      let t1000 = 0;
      // 允许秒未输入，默认为 0
      let m = Number(this.data.swimT1000M); if(!isFinite(m)) m = 0;
      let s = (this.data.swimT1000S === '' ? 0 : Number(this.data.swimT1000S)); if(!isFinite(s)) s = 0;
      t1000 = m*60 + s;
      if(!t1000){ wx.showToast({ title:'请输入1000m成绩', icon:'none' }); return; }
      const v0 = 1000 / t1000;
      v = v0 * 0.985; // 轻微校正
    }
    const pace100Sec = 100/v;
    const pace100 = this.formatSecondsToPace(pace100Sec);
    const zones = [
      { name:'热身/恢复', range: this.rangeText(pace100Sec+15, pace100Sec+25) },
      { name:'z1 恢复', range: this.rangeText(pace100Sec+10, pace100Sec+15) },
      { name:'z2 有氧', range: this.rangeText(pace100Sec+5, pace100Sec+10) },
      { name:'z3 节奏', range: this.rangeText(pace100Sec-0, pace100Sec+5) },
      { name:'z4 阈值门槛', range: this.rangeText(pace100Sec-10, pace100Sec-5) },
      { name:'z5 VO2/耐受', range: this.rangeText(pace100Sec-20, pace100Sec-10) }
    ];
    // CSS锚定预测：参考 1500m
    const Tref = 1500 / v; // 秒
    const b = this.getSwimBExponent();
    const f = this.getSwimConditionFactor();
    const swimPred = [750,1500,1900,3800].map(d=>{
      const timeSec = Tref * Math.pow(d/1500, b) * f;
      const pace100Sec2 = timeSec / (d / 100);
      return { name: `${d}m`, time: this.formatSecondsToHMS(timeSec), pace: `${this.formatSecondsToPace(pace100Sec2)} /100m` };
    });
    this.setData({ swimPace100: pace100, swimZones: zones, swimPredItems: swimPred, swimCalculated: true });
  },
  onSwimMethodChange(e){
    const idx = parseInt(e.detail.value,10);
    this.setData({ swimMethodIndex: idx, swimCalculated: false });
  },
  // 预测参数与联动
  onSwimPredLevelChange(e){ this.setData({ swimPredLevelIndex: parseInt(e.detail.value,10) }); if(this.data.swimCalculated) this.recomputeSwimPred(); },
  onSwimThermalSuit(e){ this.setData({ swimThermalSuit: !!e.detail.value }); if(this.data.swimCalculated) this.recomputeSwimPred(); },
  onSwimDrafting(e){ this.setData({ swimDrafting: !!e.detail.value }); if(this.data.swimCalculated) this.recomputeSwimPred(); },
  onSwimWaterChange(e){ this.setData({ swimWaterIndex: parseInt(e.detail.value,10) }); if(this.data.swimCalculated) this.recomputeSwimPred(); },
  getSwimBExponent(){ const idx=this.data.swimPredLevelIndex; return idx===0?1.03:(idx===1?1.06:1.08); },
  getSwimConditionFactor(){ const fWet = this.data.swimThermalSuit?0.97:1.00; const fDraft = this.data.swimDrafting?0.98:1.00; const waterIdx=this.data.swimWaterIndex; const fWater = waterIdx===0?1.00:(waterIdx===1?1.02:1.05); return fWet * fDraft * fWater; },
  recomputeSwimPred(){
    // 使用最近一次 CSS 计算的 v
    // 反算 v 自 pace100：pace100Sec = 100/v → v = 100/pace100Sec
    const pace100Sec = this.parseTimeToSeconds(this.data.swimPace100);
    if(!pace100Sec) return;
    const v = 100 / pace100Sec;
    const Tref = 1500 / v;
    const b = this.getSwimBExponent();
    const f = this.getSwimConditionFactor();
    const swimPred = [750,1500,1900,3800].map(d=>{
      const timeSec = Tref * Math.pow(d/1500, b) * f;
      const pace100Sec2 = timeSec / (d / 100);
      return { name: `${d}m`, time: this.formatSecondsToHMS(timeSec), pace: `${this.formatSecondsToPace(pace100Sec2)} /100m` };
    });
    this.setData({ swimPredItems: swimPred });
  },
  resetSwim(){ this.setData({ swimT200:'', swimT400:'', swimT1000M:'', swimT1000S:'', swimPace100:'', swimZones:[], swimCalculated:false }); },
  // 1000m TT 输入
  onSwimT1000M(e){ this.setData({ swimT1000M: e.detail.value, swimCalculated: false }); },
  onSwimT1000S(e){ this.setData({ swimT1000S: e.detail.value, swimCalculated: false }); },

  // ===== 骑行 FTP =====
  onBikeFTP(e){ this.setData({ bikeFTP: e.detail.value, bikeCalculated:false }); },
  calculateBike(){
    const ftp = parseFloat(this.data.bikeFTP);
    if(isNaN(ftp) || ftp<=0){ wx.showToast({ title:'请输入有效 FTP', icon:'none' }); return; }
    // LT1/2 取分区上沿：LT1 = z2 上沿，LT2 = z4 上沿
    const lt1 = Math.round(ftp*0.83);
    const lt2 = Math.round(ftp*1.00);
    const zone = (lo,hi)=>`${Math.round(lo)} w ~ ${Math.round(hi)} w`;
    let zones = [
      { name:'热身/冷身', range: zone(0, ftp*0.40) },
      { name:'z1 恢复', range: zone(ftp*0.40, ftp*0.71) },
      { name:'z2 有氧', range: zone(ftp*0.71, ftp*0.83) },
      { name:'z3 节奏', range: zone(ftp*0.83, ftp*0.91) },
      { name:'z4 阈值门槛', range: zone(ftp*0.91, ftp*1.00) },
      { name:'z5A 阈值上限', range: zone(ftp*1.00, ftp*1.02) },
      { name:'z5B 最大摄氧量', range: zone(ftp*1.02, ftp*1.10) },
      { name:'z5C 无氧能力', range: `${Math.round(ftp*1.10)} w ~ max` }
    ];
    // 插入 LT 分隔（蓝色虚线）在 z2/z3 与 z4/z5A 之间
    zones.splice(3, 0, { sep: true, label: `LT1：${lt1} w` });
    zones.splice(6, 0, { sep: true, label: `LT2：${lt2} w` });
    // 速度预测（基础空气动力学模型）
    // 假设：CdA=0.25 m^2（休息把），rho=1.226 kg/m^3，Crr=0.0035，质量=75kg（65kg+10kg），传动损耗3%
    const rho = 1.226, cda = 0.25, crr = 0.0035, mass = 75, g = 9.81, driveLoss = 0.03
    const aero = (v)=>0.5*rho*cda*v*v*v
    const roll = (v)=>crr*mass*g*v
    const solveSpeed = (pEff)=>{
      let lo = 1.0, hi = 25.0
      for(let i=0;i<60;i++){
        const mid = (lo+hi)/2
        const pmid = aero(mid)+roll(mid)
        if(pmid > pEff) hi = mid; else lo = mid
      }
      return (lo+hi)/2
    }
    // 铁三距离预测（20/40/90/180km）按典型IF
    const IFs = this.data.bikeIFs
    const distances = [20000, 40000, 90000, 180000]
    const names = ['20km','40km','90km','180km']
    const getIF = (d)=> d===20000?IFs.d20 : d===40000?IFs.d40 : d===90000?IFs.d90 : IFs.d180
    const preds = distances.map((d,idx)=>{
      const IF = getIF(d)
      const pEff = ftp * IF * (1 - driveLoss)
      const v = solveSpeed(pEff)
      const kmh = v * 3.6
      const tSec = d / v
      return { name: names[idx], speed: `${kmh.toFixed(1)} km/h`, time: this.formatSecondsToHMS(tSec), power: `${Math.round(pEff)} w` }
    })
    this.setData({ bikeLT1: lt1, bikeLT2: lt2, bikeZones: zones, bikeCalculated:true, bikePreds: preds });
  },
  onBikeIFChange(e){
    const key = e.currentTarget.dataset.key
    const val = parseInt(e.detail.value, 10)
    if(!key || isNaN(val)) return
    const pct = Math.max(60, Math.min(100, val)) / 100
    const IFs = Object.assign({}, this.data.bikeIFs)
    IFs[key] = pct
    const IFValue = Object.assign({}, this.data.bikeIFValue); IFValue[key] = Math.round(pct*100)
    const IFPct = Object.assign({}, this.data.bikeIFPct); IFPct[key] = `${IFValue[key]}%`
    this.setData({ bikeIFs: IFs, bikeIFValue: IFValue, bikeIFPct: IFPct })
    // 立即联动更新
    this.recomputeBikePreds()
  },
  recomputeBikePreds(){
    const ftp = parseFloat(this.data.bikeFTP);
    if(isNaN(ftp) || ftp<=0){ return; }
    const rho = 1.226, cda = 0.25, crr = 0.0035, mass = 75, g = 9.81, driveLoss = 0.03
    const aero = (v)=>0.5*rho*cda*v*v*v
    const roll = (v)=>crr*mass*g*v
    const solveSpeed = (pEff)=>{ let lo=1.0, hi=25.0; for(let i=0;i<60;i++){ const mid=(lo+hi)/2; const pmid=aero(mid)+roll(mid); if(pmid>pEff) hi=mid; else lo=mid } return (lo+hi)/2 }
    const IFs = this.data.bikeIFs
    const distances = [20000, 40000, 90000, 180000]
    const names = ['20km','40km','90km','180km']
    const getIF = (d)=> d===20000?IFs.d20 : d===40000?IFs.d40 : d===90000?IFs.d90 : IFs.d180
    const preds = distances.map((d,idx)=>{ const IF=getIF(d); const pEff=ftp*IF*(1-driveLoss); const v=solveSpeed(pEff); const kmh=v*3.6; const tSec=d/v; return { name:names[idx], speed:`${kmh.toFixed(1)} km/h`, time:this.formatSecondsToHMS(tSec), power:`${Math.round(pEff)} w` } })
    // 同步显示百分比文本
    const IFValue = {
      d20: Math.round(this.data.bikeIFs.d20*100),
      d40: Math.round(this.data.bikeIFs.d40*100),
      d90: Math.round(this.data.bikeIFs.d90*100),
      d180: Math.round(this.data.bikeIFs.d180*100)
    }
    const IFPct = { d20: `${IFValue.d20}%`, d40: `${IFValue.d40}%`, d90: `${IFValue.d90}%`, d180: `${IFValue.d180}%` }
    this.setData({ bikePreds: preds, bikeIFValue: IFValue, bikeIFPct: IFPct })
  },

  toggleBikeNote(){ this.setData({ showBikeNote: !this.data.showBikeNote }); },
  resetBike(){ this.setData({ bikeFTP:'', bikeLT1:0, bikeLT2:0, bikeZones:[], bikeCalculated:false }); },

  // ===== 跑步 阈值 =====
  onRunSourceChange(e){ this.setData({ runSourceIndex: parseInt(e.detail.value), runCalculated:false }); },
  onRunBestTime(e){ this.setData({ runBestTime: e.detail.value, runCalculated:false }); },
  onRunBestH(e){ this.setData({ runBestH: e.detail.value, runCalculated:false }); },
  onRunBestM(e){ this.setData({ runBestM: e.detail.value, runCalculated:false }); },
  onRunBestS(e){ this.setData({ runBestS: e.detail.value, runCalculated:false }); },
  calculateRun(){
    const src = this.data.runSources[this.data.runSourceIndex].value;
    let t = 0;
    const hasSegInput = (this.data.runBestH !== '' || this.data.runBestM !== '' || this.data.runBestS !== '');
    if (hasSegInput) {
      let h = Number(this.data.runBestH);
      let m = Number(this.data.runBestM);
      let s = Number(this.data.runBestS);
      if (!isFinite(h)) h = 0;
      if (!isFinite(m)) m = 0;
      if (!isFinite(s)) s = 0;
      t = h * 3600 + m * 60 + s;
    } else {
      t = this.parseTimeToSeconds(this.data.runBestTime);
    }
    if(!t || t<=0){ wx.showToast({ title:'请输入有效成绩', icon:'none' }); return; }
    // 由比赛成绩计算 VDOT → 反解 T pace
    const distanceMeters = src==='10k' ? 10000 : (src==='hm' ? 21097.5 : 42195);
    const tMinutes = t/60;
    const v_m_per_min = distanceMeters / tMinutes;
    const VO2 = -4.6 + 0.182258 * v_m_per_min + 0.000104 * v_m_per_min * v_m_per_min;
    const percent = 0.8 + 0.1894393 * Math.exp(-0.012778 * tMinutes) + 0.2989558 * Math.exp(-0.1932605 * tMinutes);
    const VDOT = VO2 / percent;
    const T_percent = 0.88; // Daniels 阈值强度近似 88% VO2max
    const VO2_T = VDOT * T_percent;
    const a = 0.000104, b = 0.182258, c = -(VO2_T + 4.6);
    const disc = b*b - 4*a*c;
    const vT_m_per_min = (-b + Math.sqrt(disc)) / (2*a);
    const TsecPerKm = (1000 / vT_m_per_min) * 60; // 秒/公里
    const vT = 1000 / TsecPerKm; // m/s
    // LT1/2 取分区上沿：直接基于 T 配速换算
    const LT1pace = this.formatSecondsToPace(TsecPerKm / 0.94);
    const Tpace = this.formatSecondsToPace(TsecPerKm);
    const rangePace = (loPct, hiPct) => {
      const lo = TsecPerKm / loPct;
      const hi = TsecPerKm / hiPct;
      return `${this.formatSecondsToPace(lo)} ~ ${this.formatSecondsToPace(hi)} min/km`;
    };
    let zones = [
      { name:'热身/恢复', range: rangePace(0.70, 0.80) },
      { name:'z1 恢复', range: rangePace(0.80, 0.88) },
      { name:'z2 有氧', range: rangePace(0.88, 0.94) },
      { name:'z3 马拉松', range: rangePace(0.94, 0.98) },
      { name:'z4 阈值门槛', range: rangePace(0.98, 1.00) },
      { name:'z5 速度间歇', range: rangePace(1.00, 1.15) }
    ];
    // 插入 LT 分隔在 z2/z3 与 z4/z5 之间
    zones.splice(3, 0, { sep: true, label: `LT1：${LT1pace}` });
    zones.splice(6, 0, { sep: true, label: `LT2：${Tpace}` });
    // 预测比赛成绩：严格 VDOT 等效（数值解）
    const vdotPerf = (D, tMin) => {
      const v = D / tMin; // m/min
      const VO2p = -4.6 + 0.182258 * v + 0.000104 * v * v;
      const perc = 0.8 + 0.1894393 * Math.exp(-0.012778 * tMin) + 0.2989558 * Math.exp(-0.1932605 * tMin);
      return VO2p / perc;
    };
    const predictVDOTTime = (D, VDOT, vT_mps) => {
      let guessMin = (D / vT_mps) / 60; // 初始猜测（分钟）
      let low = Math.max(0.1, guessMin * 0.5);
      let high = guessMin * 1.5;
      while (vdotPerf(D, low) < VDOT) low *= 0.8;
      while (vdotPerf(D, high) > VDOT) high *= 1.2;
      for (let i = 0; i < 40; i++) {
        const mid = (low + high) / 2;
        const vm = vdotPerf(D, mid);
        if (vm > VDOT) low = mid; else high = mid;
      }
      return (low + high) / 2 * 60; // 秒
    };
    const preds = [5000,10000,21097.5,42195].map((d,idx)=>{
      const timeSec = predictVDOTTime(d, VDOT, vT);
      const paceSecPerKm = timeSec / (d / 1000);
      return {
        name: idx===0?'5K':idx===1?'10K':idx===2?'半马':'全马',
        time: this.formatSecondsToHMS(timeSec),
        pace: `${this.formatSecondsToPace(paceSecPerKm)} min/km`
      };
    });
    this.setData({ runTPace: Tpace, runLT1Pace: LT1pace, runZones: zones, runPredItems: preds, runCalculated:true });
  },
  resetRun(){ this.setData({ runBestTime:'', runTPace:'', runLT1Pace:'', runZones:[], runCalculated:false }); },

  // ===== 通用工具 =====
  parseTimeToSeconds(str){
    if(!str) return 0; const parts = str.split(':').map(Number); if(parts.some(isNaN)) return 0;
    if(parts.length===2) return parts[0]*60 + parts[1];
    if(parts.length===3) return parts[0]*3600 + parts[1]*60 + parts[2];
    return 0;
  },
  formatSecondsToPace(sec){ const s=Math.round(sec); const mm=Math.floor(s/60); const ss=String(s%60).padStart(2,'0'); return `${mm}:${ss}`; },
  rangeText(secLo,secHi){ const lo=this.formatSecondsToPace(Math.max(1,secLo)); const hi=this.formatSecondsToPace(Math.max(1,secHi)); return `${lo} ~ ${hi} /100m`; },
  formatSecondsToHMS(sec){ const s=Math.round(sec); const hh=Math.floor(s/3600); const mm=Math.floor((s%3600)/60); const ss=String(s%60).padStart(2,'0'); return `${hh}:${String(mm).padStart(2,'0')}:${ss}`; }
});
