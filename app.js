/* ═══════════════════════════════════════════════════════════
   TOURNAMENTS LISTENER — Game + Mode + Team Size filtering
═══════════════════════════════════════════════════════════ */
function attachTournamentsListener() {
  if (state.unsubs.tournaments) state.unsubs.tournaments();
  D.tournamentsSkeleton.classList.remove("hidden");
  D.tournamentsList.innerHTML = "";
  D.tournamentsEmpty.classList.add("hidden");

  const q = query(collection(db, "tournaments"), where("game", "==", state.activeGame));
  state.unsubs.tournaments = onSnapshot(q, (snap) => {
    let items = [];
    snap.forEach((d) => items.push({ id: d.id, ...d.data() }));

    // Filter by mode (Battle Royale / TDM / Clash Squad)
    items = items.filter(t => {
      const m = normalizeMode(t);
      return m.toLowerCase() === state.activeMode.toLowerCase();
    });

    // Filter by team size (Solo / Duo / Squad / ALL)
    if (state.activeTeam !== "ALL") {
      items = items.filter(t => {
        const team = normalizeTeamSize(t);
        return team.toLowerCase() === state.activeTeam.toLowerCase();
      });
    }

    // Hide cancelled matches from browse
    const visible = items.filter(t => t.status !== "CANCELLED");
    visible.sort((a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0));

    state.tournaments = visible;
    renderTournaments(visible);
  }, (err) => {
    console.error("Tournaments listener:", err);
    D.tournamentsSkeleton.classList.add("hidden");
    D.tournamentsEmpty.classList.remove("hidden");
  });
}

/* ═══════════════════════════════════════════════════════════
   JOINED MATCHES LISTENER
═══════════════════════════════════════════════════════════ */
function attachJoinedListener(uid) {
  const q = query(collection(db, "tournaments"), where("joinedUsers", "array-contains", uid));
  state.unsubs.joined = onSnapshot(q, (snap) => {
    const items = [];
    snap.forEach((d) => items.push({ id: d.id, ...d.data() }));
    items.sort((a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0));
    state.joinedMatches = items;
    renderJoined(items);
    // Re-render tournaments so "JOINED" button states update
    if (state.tournaments.length) renderTournaments(state.tournaments);
  }, (err) => console.error("Joined listener:", err));
}

/* ═══════════════════════════════════════════════════════════
   WALLET TRANSACTIONS LISTENER
═══════════════════════════════════════════════════════════ */
function attachTxListener(uid) {
  const q = query(collection(db, "wallet_transactions"), where("uid", "==", uid));
  state.unsubs.tx = onSnapshot(q, (snap) => {
    const items = [];
    snap.forEach((d) => items.push({ id: d.id, ...d.data() }));
    items.sort((a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0));
    state.transactions = items;
    renderTransactions(items);

    // Prize popup detection
    const latestPrize = items.find(tx =>
      tx.type === "credit" &&
      (tx.category === "prize" || (tx.description || "").toLowerCase().includes("prize"))
    );
    if (latestPrize && latestPrize.id !== state.lastPrizeNotifId) {
      if (state.lastPrizeNotifId !== null) {
        showPrizePopup("🏆 PRIZE CREDITED!", latestPrize.amount);
        showToast(`🏆 ₹${fmtMoney(latestPrize.amount)} prize credited!`, "prize");
      }
      state.lastPrizeNotifId = latestPrize.id;
    }
  }, (err) => console.error("Tx listener:", err));
}

/* ═══════════════════════════════════════════════════════════
   NOTIFICATIONS LISTENER
═══════════════════════════════════════════════════════════ */
function attachNotifListener(uid) {
  const q = query(collection(db, "notifications"), where("uid", "==", uid));
  state.unsubs.notif = onSnapshot(q, (snap) => {
    const items = [];
    snap.forEach((d) => items.push({ id: d.id, ...d.data() }));
    items.sort((a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0));

    const oldCount = state.notifications.length;
    state.notifications = items;
    renderNotifBadge();
    renderNotifList();

    // Trigger prize popup for new prize notifications
    if (oldCount > 0 && items.length > 0) {
      const newest = items[0];
      if (!newest.read && newest.type === "prize" && newest.id !== state.lastPrizeNotifId) {
        showPrizePopup(newest.title || "🏆 PRIZE CREDITED!", newest.amount || 0);
        state.lastPrizeNotifId = newest.id;
      }
    }
  }, (err) => console.error("Notif listener:", err));
}

/* ═══════════════════════════════════════════════════════════
   REFERRALS LISTENER
═══════════════════════════════════════════════════════════ */
function attachReferralsListener(uid) {
  const q = query(collection(db, "users"), where("referredBy", "==", uid));
  state.unsubs.referrals = onSnapshot(q, (snap) => {
    const items = [];
    snap.forEach((d) => items.push({ id: d.id, ...d.data() }));
    state.referrals = items;
    renderReferralStats();
  }, (err) => console.warn("Referrals listener:", err));
}

function renderReferralStats() {
  if (!D.refCountJoined) return;
  const total = state.referrals.length;
  const rewarded = state.referrals.filter(r => r.referralRewarded === true).length;
  const pending = total - rewarded;
  D.refCountJoined.textContent = total;
  D.refCountEarned.textContent = "₹" + (rewarded * REFERRER_BONUS);
  D.refCountPending.textContent = pending;
}

/* ═══════════════════════════════════════════════════════════
   NOTIFICATION BADGE & LIST RENDERING
═══════════════════════════════════════════════════════════ */
function renderNotifBadge() {
  const unread = state.notifications.filter(n => !n.read).length;
  if (D.notifBadge) {
    if (unread > 0) {
      D.notifBadge.textContent = unread > 9 ? "9+" : unread;
      D.notifBadge.style.display = "inline-flex";
    } else {
      D.notifBadge.style.display = "none";
    }
  }
  if (D.navNotifDot) {
    if (unread > 0) {
      D.navNotifDot.textContent = unread > 9 ? "9+" : unread;
      D.navNotifDot.style.display = "inline-flex";
    } else {
      D.navNotifDot.style.display = "none";
    }
  }
}

function renderNotifList() {
  if (!D.notifList) return;
  if (!state.notifications.length) {
    D.notifList.innerHTML = `<div class="empty-state" style="padding:32px 16px;"><p>No notifications yet.</p></div>`;
    return;
  }
  D.notifList.innerHTML = state.notifications.slice(0, 50).map(n => {
    const isPrize = n.type === "prize" || (n.title || "").toLowerCase().includes("prize") || (n.title || "").includes("🏆");
    return `
      <div class="notif-item ${n.read ? 'read' : 'unread'} ${isPrize ? 'prize' : ''}">
        <div class="notif-head">
          <div class="notif-title">${escHTML(n.title || "Notification")}</div>
          ${!n.read ? '<span class="notif-dot"></span>' : ''}
        </div>
        <div class="notif-body">${escHTML(n.body || "")}</div>
        <div class="notif-time">${escHTML(fmtDateTime(n.createdAt))}</div>
      </div>
    `;
  }).join("");
}

/* ═══════════════════════════════════════════════════════════
   TOURNAMENT CARD RENDERING
═══════════════════════════════════════════════════════════ */
function tournamentCardHTML(t, idx, joinedIds) {
  const banned = isBanned();
  const max = Number(t.maxSlots || 100);
  const jc = Number(t.joinedCount || 0);
  const pct = Math.min(100, Math.round((jc / max) * 100));
  const full = jc >= max;
  const isJoined = joinedIds.has(t.id);
  const fee = Number(t.entryFee || 0);
  const gameCls = t.game === "Free Fire" ? "tag-FreeFire" : "tag-BGMI";
  const progressCls = pct >= 85 ? "progress-fill almost" : "progress-fill";
  const status = getMatchStatus(t);
  const pillHTML = statusPillHTML(status.key, status.label);

  const modeName = normalizeMode(t);
  const modeCls = catClass(modeName);
  const mapName = t.map || "TBA";
  const teamSizeDisplay = displayTeamSize(t);
  const rawTeam = normalizeTeamSize(t);
  const teamCls = teamClass(rawTeam);
  const teamIco = teamIcon(rawTeam);

  // Determine button state
  let btn = "JOIN NOW";
  let disabled = "";
  let extra = "";
  let actionAttr = "";

  if (banned) {
    btn = "🚫 ACCOUNT BANNED";
    disabled = "disabled";
    extra = "banned";
  } else if (status.key === "cancelled") {
    btn = "🚫 MATCH CANCELLED";
    disabled = "disabled";
    extra = "cancelled";
  } else if (status.key === "completed") {
    btn = "🏆 MATCH COMPLETED";
    disabled = "disabled";
    extra = "completed";
  } else if (status.key === "started") {
    if (isJoined) {
      btn = "🎮 VIEW ROOM — LIVE";
      extra = "started";
      actionAttr = `data-detail="${escHTML(t.id)}"`;
    } else {
      btn = "🔴 MATCH IN PROGRESS";
      disabled = "disabled";
      extra = "cancelled";
    }
  } else if (isJoined) {
    btn = "✓ JOINED — TAP FOR DETAILS";
    extra = "joined";
    actionAttr = `data-detail="${escHTML(t.id)}"`;
  } else if (full) {
    btn = "SLOTS FULL";
    disabled = "disabled";
  } else {
    actionAttr = `data-join="${escHTML(t.id)}"`;
  }

  const banner = t.bannerUrl
    ? `<img class="t-banner" src="${escHTML(t.bannerUrl)}" alt="" loading="lazy" onerror="this.style.display='none'"/>`
    : `<div class="t-banner-fallback">${escHTML(t.game || "MATCH")}</div>`;

  const cardCls = status.key === "cancelled" ? "status-cancelled" : status.key === "completed" ? "status-completed" : "";

  return `
    <article class="t-card ${cardCls}" style="animation-delay:${idx * 40}ms" data-id="${escHTML(t.id)}">
      ${banner}
      <div class="t-body">
        <div class="t-head">
          <div class="t-head-left">
            <div class="match-badges">
              <span class="t-game-tag ${gameCls}">${escHTML(t.game || "MATCH")}</span>
              <span class="t-cat-tag ${modeCls}">${escHTML(modeName)}</span>
              <span class="team-tag ${teamCls}">${teamIco} ${escHTML(teamSizeDisplay)} Match</span>
              <span class="t-map-tag">🗺️ ${escHTML(mapName)}</span>
            </div>
            <h3 class="t-title" style="margin-top:8px">
              <span class="team-label">${escHTML(teamSizeDisplay)}</span> ${escHTML(t.title || "Untitled Match")}
            </h3>
            <div class="t-time">🗓 ${escHTML(fmtDateTime(t.matchTime))}</div>
          </div>
          ${pillHTML}
        </div>
        <div class="t-stats">
          <div class="stat"><span class="lbl">Prize</span><span class="val prize">₹${fmtMoney(t.prizePool)}</span></div>
          <div class="stat"><span class="lbl">Per Kill</span><span class="val kill">₹${fmtMoney(t.perKill)}</span></div>
          <div class="stat"><span class="lbl">Entry</span><span class="val fee ${fee > 0 ? 'paid' : ''}">${fee > 0 ? "₹" + fmtMoney(fee) : "FREE"}</span></div>
        </div>
        <div class="progress-wrap">
          <div class="progress-meta"><span><strong>${jc}</strong> / ${max} slots filled</span><span>${pct}%</span></div>
          <div class="progress-bar"><div class="${progressCls}" style="width:${pct}%"></div></div>
        </div>
        <button class="join-btn ${extra}" ${disabled} ${actionAttr}>${btn}</button>
      </div>
    </article>
  `;
}

function renderTournaments(items) {
  D.tournamentsSkeleton.classList.add("hidden");
  if (!items || items.length === 0) {
    D.tournamentsList.innerHTML = "";
    D.tournamentsEmpty.classList.remove("hidden");
    return;
  }
  D.tournamentsEmpty.classList.add("hidden");
  const joinedIds = new Set(state.joinedMatches.map(m => m.id));
  D.tournamentsList.innerHTML = items.map((t, i) => tournamentCardHTML(t, i, joinedIds)).join("");
}

/* ═══════════════════════════════════════════════════════════
   JOINED MATCHES RENDERING
═══════════════════════════════════════════════════════════ */
function renderJoined(items) {
  if (!items || items.length === 0) {
    D.joinedList.innerHTML = "";
    D.joinedEmpty.classList.remove("hidden");
    return;
  }
  D.joinedEmpty.classList.add("hidden");
  D.joinedList.innerHTML = items.map((t, idx) => {
    const max = Number(t.maxSlots || 100);
    const jc = Number(t.joinedCount || 0);
    const pct = Math.min(100, Math.round((jc / max) * 100));
    const gameCls = t.game === "Free Fire" ? "tag-FreeFire" : "tag-BGMI";
    const status = getMatchStatus(t);
    const pillHTML = statusPillHTML(status.key, status.label);
    const modeName = normalizeMode(t);
    const modeCls = catClass(modeName);
    const mapName = t.map || "TBA";
    const teamSizeDisplay = displayTeamSize(t);
    const rawTeam = normalizeTeamSize(t);
    const teamCls = teamClass(rawTeam);
    const teamIco = teamIcon(rawTeam);

    const banner = t.bannerUrl
      ? `<img class="t-banner" src="${escHTML(t.bannerUrl)}" alt="" loading="lazy" onerror="this.style.display='none'"/>`
      : `<div class="t-banner-fallback">${escHTML(t.game || "MATCH")}</div>`;

    // Button logic per status
    let btnHTML = "";
    if (status.key === "cancelled") {
      btnHTML = `<button class="join-btn cancelled" disabled>🚫 CANCELLED — REFUNDED</button>`;
    } else if (status.key === "completed") {
      btnHTML = `<button class="join-btn completed" disabled>🏆 COMPLETED</button>`;
    } else if (status.key === "started") {
      btnHTML = `<button class="join-btn started" data-detail="${escHTML(t.id)}">🎮 STARTED — VIEW ROOM</button>`;
    } else if (t.roomId && t.roomPassword) {
      btnHTML = `<button class="join-btn joined" data-detail="${escHTML(t.id)}">🔑 ROOM READY — VIEW</button>`;
    } else {
      btnHTML = `<button class="join-btn joined" data-detail="${escHTML(t.id)}">⏳ AWAITING ROOM</button>`;
    }

    const cardCls = status.key === "cancelled" ? "status-cancelled" : status.key === "completed" ? "status-completed" : "";

    return `
      <article class="t-card ${cardCls}" style="animation-delay:${idx * 40}ms">
        ${banner}
        <div class="t-body">
          <div class="t-head">
            <div class="t-head-left">
              <div class="match-badges">
                <span class="t-game-tag ${gameCls}">${escHTML(t.game || "MATCH")}</span>
                <span class="t-cat-tag ${modeCls}">${escHTML(modeName)}</span>
                <span class="team-tag ${teamCls}">${teamIco} ${escHTML(teamSizeDisplay)} Match</span>
                <span class="t-map-tag">🗺️ ${escHTML(mapName)}</span>
              </div>
              <h3 class="t-title" style="margin-top:8px">
                <span class="team-label">${escHTML(teamSizeDisplay)}</span> ${escHTML(t.title || "Match")}
              </h3>
              <div class="t-time">🗓 ${escHTML(fmtDateTime(t.matchTime))}</div>
            </div>
            ${pillHTML}
          </div>
          <div class="t-stats">
            <div class="stat"><span class="lbl">Prize</span><span class="val prize">₹${fmtMoney(t.prizePool)}</span></div>
            <div class="stat"><span class="lbl">Per Kill</span><span class="val kill">₹${fmtMoney(t.perKill)}</span></div>
            <div class="stat"><span class="lbl">Entry</span><span class="val fee">₹${fmtMoney(t.entryFee)}</span></div>
          </div>
          <div class="progress-wrap">
            <div class="progress-meta"><span><strong>${jc}</strong> / ${max} slots filled</span><span>${pct}%</span></div>
            <div class="progress-bar"><div class="progress-fill" style="width:${pct}%"></div></div>
          </div>
          ${btnHTML}
        </div>
      </article>
    `;
  }).join("");
}

/* ═══════════════════════════════════════════════════════════
   TRANSACTION HISTORY RENDERING
═══════════════════════════════════════════════════════════ */
function renderTransactions(items) {
  if (!items || items.length === 0) {
    D.txList.innerHTML = "";
    D.txEmpty.classList.remove("hidden");
    return;
  }
  D.txEmpty.classList.add("hidden");
  D.txList.innerHTML = items.slice(0, 40).map((tx, i) => {
    const amt = Number(tx.amount || 0);
    const credit = tx.type === "credit" || amt > 0;
    const sign = credit ? "+" : "−";
    const cls = credit ? "credit" : "debit";
    const title = tx.description || tx.title || (credit ? "Wallet Credit" : "Wallet Debit");
    return `
      <div class="tx-item" style="animation-delay:${i * 25}ms">
        <div class="tx-left">
          <div class="tx-title">${escHTML(title)}</div>
          <div class="tx-time">${escHTML(fmtDateTime(tx.createdAt))}</div>
        </div>
        <div class="tx-amt ${cls}">${sign}₹${fmtMoney(Math.abs(amt))}</div>
      </div>
    `;
  }).join("");
}

/* ═══════════════════════════════════════════════════════════
   NAVIGATION & FILTERS
═══════════════════════════════════════════════════════════ */
function setNav(nav) {
  state.activeNav = nav;
  $$(".nav-btn").forEach(b => b.classList.toggle("active", b.dataset.nav === nav));
  $$(".view").forEach(v => v.classList.remove("active"));
  const map = { home: "view-home", joined: "view-joined", wallet: "view-wallet", profile: "view-profile", terms: "view-terms" };
  document.getElementById(map[nav])?.classList.add("active");
  window.scrollTo({ top: 0, behavior: "instant" });
}

$$(".nav-btn").forEach(b => b.addEventListener("click", () => setNav(b.dataset.nav)));

$$(".gf-btn").forEach(b => {
  b.addEventListener("click", () => {
    if (state.activeGame === b.dataset.game) return;
    state.activeGame = b.dataset.game;
    const modes = GAME_MODES[state.activeGame] || [];
    state.activeMode = modes[0] || "Battle Royale";
    $$(".gf-btn").forEach(x => x.classList.toggle("active", x === b));
    renderModeFilter();
    attachTournamentsListener();
  });
});

D.hdrWallet.addEventListener("click", () => setNav("wallet"));

D.notifBtn?.addEventListener("click", async () => {
  openModal("notifModal");
  renderNotifList();
  const unread = state.notifications.filter(n => !n.read);
  for (const n of unread) {
    try { await updateDoc(doc(db, "notifications", n.id), { read: true }); } catch (e) {}
  }
});

document.addEventListener("click", (e) => {
  const closeBtn = e.target.closest("[data-close]");
  if (closeBtn) { closeModal(closeBtn.dataset.close); return; }
  if (e.target.classList.contains("modal-overlay")) e.target.classList.remove("open");
});

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") $$(".modal-overlay.open").forEach(m => m.classList.remove("open"));
});

/* ═══════════════════════════════════════════════════════════
   TOURNAMENT CARD CLICKS
═══════════════════════════════════════════════════════════ */
D.tournamentsList.addEventListener("click", (e) => {
  if (state.forceUpdateActive) { e.preventDefault(); e.stopPropagation(); return; }
  const joinBtn = e.target.closest("[data-join]");
  const detailBtn = e.target.closest("[data-detail]");
  if (joinBtn) {
    const id = joinBtn.dataset.join;
    const match = state.tournaments.find(t => t.id === id);
    if (match) openJoinModal(match);
  } else if (detailBtn) {
    const id = detailBtn.dataset.detail;
    const match = state.tournaments.find(t => t.id === id) || state.joinedMatches.find(t => t.id === id);
    if (match) openDetailModal(match);
  }
});

D.joinedList.addEventListener("click", (e) => {
  if (state.forceUpdateActive) { e.preventDefault(); e.stopPropagation(); return; }
  const detailBtn = e.target.closest("[data-detail]");
  if (detailBtn) {
    const id = detailBtn.dataset.detail;
    const match = state.joinedMatches.find(t => t.id === id);
    if (match) openDetailModal(match);
  }
});

/* ═══════════════════════════════════════════════════════════
   OPEN JOIN MODAL
═══════════════════════════════════════════════════════════ */
function openJoinModal(match) {
  if (state.forceUpdateActive) { showToast("Please update the app first.", "error"); return; }
  if (isBanned()) { showToast("🚫 Your account is banned.", "error"); return; }

  state.selectedMatch = match;
  const fee = Number(match.entryFee || 0);
  const bal = getRealBalance(state.profile);
  const bonus = getBonusBalance(state.profile);
  const total = bal + bonus;
  const modeName = normalizeMode(match);
  const teamSizeDisplay = displayTeamSize(match);
  const rawTeam = normalizeTeamSize(match);
  const teamIco = teamIcon(rawTeam);

  D.joinSummary.innerHTML = `
    <div class="ms-title">${escHTML(match.title || "Match")}</div>
    <div class="ms-row"><span>Game</span><strong>${escHTML(match.game || "")}</strong></div>
    <div class="ms-row"><span>Mode</span><strong>${escHTML(modeName)}</strong></div>
    <div class="ms-row"><span>Team</span><strong>${teamIco} ${escHTML(teamSizeDisplay)}</strong></div>
    <div class="ms-row"><span>Map</span><strong>${escHTML(match.map || "TBA")}</strong></div>
    <div class="ms-row"><span>Match Time</span><strong>${escHTML(fmtDateTime(match.matchTime))}</strong></div>
    <div class="ms-row fee"><span>Entry Fee</span><strong>₹${fmtMoney(fee)}</strong></div>
    <div class="ms-row"><span>Wallet</span><strong>₹${fmtMoney(bal)}</strong></div>
    ${bonus > 0 ? `<div class="ms-row"><span>Bonus</span><strong style="color:var(--green)">₹${fmtMoney(bonus)}</strong></div>` : ""}
    <div class="ms-row"><span>Total Available</span><strong>₹${fmtMoney(total)}</strong></div>
  `;

  D.joinForm.reset();
  D.joinErr.textContent = "";
  if (state.profile?.ign) D.joinIgn.value = state.profile.ign;
  if (state.profile?.gameUid) D.joinUid.value = state.profile.gameUid;

  if (fee > total) {
    D.joinErr.textContent = `Insufficient balance. Need ₹${fmtMoney(fee - total)} more.`;
    D.joinSubmit.disabled = true;
  } else {
    D.joinSubmit.disabled = false;
  }
  openModal("joinModal");
}

/* ═══════════════════════════════════════════════════════════
   JOIN FORM SUBMIT — verify wallet, deduct, log, update
═══════════════════════════════════════════════════════════ */
D.joinForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!state.user || !state.selectedMatch) return;
  if (isBanned()) { D.joinErr.textContent = "Account banned."; return; }

  const match = state.selectedMatch;
  const ign = D.joinIgn.value.trim();
  const gameUid = D.joinUid.value.trim();

  if (ign.length < 2) { D.joinErr.textContent = "Enter a valid IGN."; return; }
  if (!/^[0-9]{6,15}$/.test(gameUid)) { D.joinErr.textContent = "Game UID must be 6-15 digits."; return; }

  D.joinSubmit.disabled = true;
  D.joinSubmit.innerHTML = `<span class="spinner"></span>PROCESSING...`;
  D.joinErr.textContent = "";

  try {
    const userRef = doc(db, "users", state.user.uid);
    const matchRef = doc(db, "tournaments", match.id);

    await runTransaction(db, async (tx) => {
      const userSnap = await tx.get(userRef);
      const matchSnap = await tx.get(matchRef);
      if (!userSnap.exists()) throw new Error("User profile missing.");
      if (!matchSnap.exists()) throw new Error("Match no longer available.");

      const uData = userSnap.data();
      const mData = matchSnap.data();

      if (uData.banned === true) throw new Error("Account banned.");
      if (mData.status === "CANCELLED") throw new Error("Match cancelled.");
      if (mData.status === "COMPLETED" || mData.completed === true) throw new Error("Match already completed.");
      if (mData.status === "STARTED" || mData.started === true) throw new Error("Match already started.");

      const balance = getRealBalance(uData);
      const bonus = getBonusBalance(uData);
      const total = balance + bonus;
      const fee = Number(mData.entryFee || 0);
      const joined = Number(mData.joinedCount || 0);
      const max = Number(mData.maxSlots || 0);
      const joinedUsers = Array.isArray(mData.joinedUsers) ? mData.joinedUsers : [];

      if (joinedUsers.includes(state.user.uid)) throw new Error("You have already joined this match.");
      if (joined >= max) throw new Error("Match is full.");
      if (total < fee) throw new Error("Insufficient balance.");

      // Deduct from bonus first, then real balance
      let newBonus = bonus;
      let newBalance = balance;
      if (bonus >= fee) {
        newBonus = bonus - fee;
      } else {
        newBonus = 0;
        newBalance = balance - (fee - bonus);
      }

      // Write to all balance field names that already exist (server compatibility)
      const updatePayload = {
        balance: newBalance,
        bonusBalance: newBonus,
        ign,
        gameUid,
        matchesPlayed: increment(1)
      };
      if (typeof uData.bonus !== "undefined") updatePayload.bonus = newBonus;
      if (typeof uData.bonusWallet !== "undefined") updatePayload.bonusWallet = newBonus;
      if (typeof uData.signupBonus !== "undefined") updatePayload.signupBonus = newBonus;
      if (typeof uData.referralBonus !== "undefined") updatePayload.referralBonus = newBonus;
      if (typeof uData.realBalance !== "undefined") updatePayload.realBalance = newBalance;
      if (typeof uData.mainBalance !== "undefined") updatePayload.mainBalance = newBalance;

      tx.update(userRef, updatePayload);
      tx.update(matchRef, {
        joinedCount: increment(1),
        joinedUsers: [...joinedUsers, state.user.uid]
      });

      const partRef = doc(db, "tournaments", match.id, "participants", state.user.uid);
      tx.set(partRef, {
        uid: state.user.uid,
        ign,
        gameUid,
        entryFeePaid: fee,
        joinedAt: serverTimestamp(),
        name: uData.name || "Player"
      });
    });

    // Log the entry fee transaction
    if (Number(match.entryFee || 0) > 0) {
      await addDoc(collection(db, "wallet_transactions"), {
        uid: state.user.uid,
        amount: -Number(match.entryFee),
        type: "debit",
        category: "entry_fee",
        description: `Entry Fee — ${match.title || "Match"}`,
        matchId: match.id,
        createdAt: serverTimestamp()
      });
    }

    const newCount = (Number(state.profile?.matchesPlayed || 0) + 1);
    if (newCount >= MIN_MATCHES_FOR_WITHDRAW) {
      showToast("🎉 Withdrawal unlocked! You can now withdraw funds.", "success");
    } else {
      showToast(`Match joined! ${newCount}/${MIN_MATCHES_FOR_WITHDRAW} matches played.`, "success");
    }

    closeModal("joinModal");
  } catch (err) {
    D.joinErr.textContent = err.message || "Failed to join.";
  } finally {
    D.joinSubmit.disabled = false;
    D.joinSubmit.textContent = "CONFIRM & PAY";
  }
});

/* ═══════════════════════════════════════════════════════════
   OPEN DETAIL MODAL — shows room ID/password if room-ready
═══════════════════════════════════════════════════════════ */
function openDetailModal(match) {
  if (state.forceUpdateActive) return;

  const isJoined = state.joinedMatches.some(m => m.id === match.id);
  const max = Number(match.maxSlots || 100);
  const jc = Number(match.joinedCount || 0);
  const pct = Math.min(100, Math.round((jc / max) * 100));
  const status = getMatchStatus(match);
  const bannerHTML = statusBannerHTML(status.key, status.label);

  const hasRoom = match.roomId && match.roomPassword;
  const canSeeRoom = isJoined && hasRoom &&
    (status.key === "room-ready" || status.key === "started" || status.key === "completed");

  const modeName = normalizeMode(match);
  const teamSizeDisplay = displayTeamSize(match);
  const rawTeam = normalizeTeamSize(match);
  const teamIco = teamIcon(rawTeam);

  let roomSection = "";
  if (!isJoined) {
    roomSection = `<div class="room-box locked"><div class="room-locked-msg">🔒 Join this match to view room credentials.</div></div>`;
  } else if (canSeeRoom) {
    roomSection = `
      <div class="room-box">
        <div class="room-row"><span class="k">Room ID</span><span class="v">${escHTML(match.roomId)}</span></div>
        <div class="room-row"><span class="k">Password</span><span class="v">${escHTML(match.roomPassword)}</span></div>
      </div>
      <p class="hint">⏱ Join the custom room 5 minutes before match time.</p>`;
  } else if (status.key === "cancelled") {
    roomSection = `<div class="room-box locked"><div class="room-locked-msg">🚫 Match cancelled. Refunded.</div></div>`;
  } else if (status.key === "completed") {
    roomSection = `<div class="room-box locked"><div class="room-locked-msg">🏆 Match completed.</div></div>`;
  } else {
    roomSection = `<div class="room-box locked"><div class="room-locked-msg">🔒 Room credentials will appear once admin publishes them.</div></div>`;
  }

  let statusNote = "";
  if (status.key === "started") statusNote = `<p class="hint" style="color:var(--green);font-weight:700;">🔴 Match is LIVE!</p>`;
  else if (status.key === "completed") statusNote = `<p class="hint" style="color:var(--gold);font-weight:700;">🏆 Match ended. Check your wallet!</p>`;
  else if (status.key === "cancelled") statusNote = `<p class="hint" style="color:var(--red-2);font-weight:700;">🚫 Match cancelled. Refund processed.</p>`;

  D.detailBody.innerHTML = `
    ${bannerHTML}
    <div class="match-summary">
      <div class="ms-title">${escHTML(match.title || "Match")}</div>
      <div class="ms-row"><span>Game</span><strong>${escHTML(match.game || "")}</strong></div>
      <div class="ms-row"><span>Mode</span><strong>${escHTML(modeName)}</strong></div>
      <div class="ms-row"><span>Team</span><strong>${teamIco} ${escHTML(teamSizeDisplay)}</strong></div>
      <div class="ms-row"><span>Map</span><strong>${escHTML(match.map || "TBA")}</strong></div>
      <div class="ms-row"><span>Match Time</span><strong>${escHTML(fmtDateTime(match.matchTime))}</strong></div>
      <div class="ms-row"><span>Prize Pool</span><strong>₹${fmtMoney(match.prizePool)}</strong></div>
      <div class="ms-row"><span>Per Kill</span><strong>₹${fmtMoney(match.perKill)}</strong></div>
      <div class="ms-row fee"><span>Entry Fee</span><strong>₹${fmtMoney(match.entryFee)}</strong></div>
    </div>
    ${statusNote}
    <div class="progress-wrap" style="margin-top:14px;">
      <div class="progress-meta"><span><strong>${jc}</strong> / ${max} slots</span><span>${pct}%</span></div>
      <div class="progress-bar"><div class="progress-fill" style="width:${pct}%"></div></div>
    </div>
    <div class="sec-title" style="margin:18px 0 10px">🔑 Room Credentials</div>
    ${roomSection}
  `;
  openModal("detailModal");
}

/* ═══════════════════════════════════════════════════════════
   WITHDRAW — minimum validation + wallet debit
═══════════════════════════════════════════════════════════ */
D.btnWithdraw.addEventListener("click", () => {
  if (state.forceUpdateActive) { showToast("Please update the app first.", "error"); return; }
  if (isBanned()) { showToast("🚫 Banned accounts cannot withdraw.", "error"); return; }

  D.withdrawForm.reset();
  D.wdErr.textContent = "";
  const matchesPlayed = Number(state.profile?.matchesPlayed || 0);

  if (matchesPlayed < MIN_MATCHES_FOR_WITHDRAW) {
    D.wdRuleBox.style.display = "flex";
    D.wdRuleBox.className = "utr-status pending";
    D.wdRuleBox.innerHTML = `⚠️ You must play at least <b>${MIN_MATCHES_FOR_WITHDRAW} matches</b> before withdrawing. You have played <b>${matchesPlayed}/${MIN_MATCHES_FOR_WITHDRAW}</b>.`;
  } else {
    D.wdRuleBox.style.display = "none";
  }
  openModal("withdrawModal");
});

D.withdrawForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!state.user) return;
  if (isBanned()) { D.wdErr.textContent = "Account banned."; return; }

  const matchesPlayed = Number(state.profile?.matchesPlayed || 0);
  if (matchesPlayed < MIN_MATCHES_FOR_WITHDRAW) {
    D.wdErr.textContent = `You must play at least ${MIN_MATCHES_FOR_WITHDRAW} matches. Currently: ${matchesPlayed}/${MIN_MATCHES_FOR_WITHDRAW}.`;
    return;
  }

  const upi = D.wdUpi.value.trim();
  const amt = Number(D.wdAmt.value);
  D.wdErr.textContent = "";

  if (!/^[\w.\-]{2,}@[\w.\-]{2,}$/.test(upi)) { D.wdErr.textContent = "Enter a valid UPI ID."; return; }
  if (!amt || amt < MIN_WITHDRAW) { D.wdErr.textContent = `Minimum withdrawal is ₹${MIN_WITHDRAW}.`; return; }

  const bal = getRealBalance(state.profile);
  if (amt > bal) { D.wdErr.textContent = "Insufficient balance. (Bonus cannot be withdrawn)"; return; }

  D.wdSubmit.disabled = true;
  D.wdSubmit.innerHTML = `<span class="spinner"></span>SUBMITTING...`;

  try {
    const userRef = doc(db, "users", state.user.uid);
    await runTransaction(db, async (tx) => {
      const userSnap = await tx.get(userRef);
      if (!userSnap.exists()) throw new Error("User not found.");
      const uData = userSnap.data();
      if (uData.banned === true) throw new Error("Account banned.");
      if (Number(uData.matchesPlayed || 0) < MIN_MATCHES_FOR_WITHDRAW) {
        throw new Error(`You must play at least ${MIN_MATCHES_FOR_WITHDRAW} matches.`);
      }
      const currentBal = getRealBalance(uData);
      if (currentBal < amt) throw new Error("Insufficient balance.");

      const withdrawPayload = { balance: increment(-amt) };
      if (typeof uData.realBalance !== "undefined") withdrawPayload.realBalance = increment(-amt);
      if (typeof uData.mainBalance !== "undefined") withdrawPayload.mainBalance = increment(-amt);
      if (typeof uData.wallet !== "undefined") withdrawPayload.wallet = increment(-amt);
      if (typeof uData.walletBalance !== "undefined") withdrawPayload.walletBalance = increment(-amt);
      tx.update(userRef, withdrawPayload);
    });

    await addDoc(collection(db, "withdrawals"), {
      uid: state.user.uid,
      name: state.profile?.name || "Player",
      email: state.profile?.email || "",
      phone: state.profile?.phone || "",
      upi,
      amount: amt,
      status: "PENDING",
      createdAt: serverTimestamp()
    });

    await addDoc(collection(db, "wallet_transactions"), {
      uid: state.user.uid,
      amount: -amt,
      type: "debit",
      category: "withdrawal",
      description: `Withdrawal → ${upi}`,
      createdAt: serverTimestamp()
    });

    closeModal("withdrawModal");
    showToast("Withdrawal request submitted successfully.", "success");
  } catch (err) {
    D.wdErr.textContent = err.message || "Withdrawal failed.";
  } finally {
    D.wdSubmit.disabled = false;
    D.wdSubmit.textContent = "REQUEST WITHDRAWAL";
  }
});

/* ═══════════════════════════════════════════════════════════
   DEPOSIT FLOW
═══════════════════════════════════════════════════════════ */
function resetDepositFlow() {
  stopDepositPolling();
  state.deposit = { amount: 0, orderId: "", pollTimer: null };
  D.depAmount.value = "";
  D.depErr.textContent = "";
  D.depBonusHint.style.display = "none";
  D.utrStatusBox.classList.add("hidden");
  D.utrStatusBox.className = "utr-status hidden";
  D.btnPayNow.disabled = false;
  D.btnPayNow.style.display = "block";
  D.btnPayNow.innerHTML = `💳 PAY VIA PAYPAL`;
  $$(".amt-chip").forEach(c => c.classList.remove("active"));
}

$$(".amt-chip").forEach(chip => {
  chip.addEventListener("click", () => {
    $$(".amt-chip").forEach(c => c.classList.remove("active"));
    chip.classList.add("active");
    D.depAmount.value = chip.dataset.amt;
    state.deposit.amount = Number(chip.dataset.amt);
    checkBonusHint(Number(chip.dataset.amt));
  });
});

D.depAmount.addEventListener("input", () => {
  const v = Number(D.depAmount.value);
  $$(".amt-chip").forEach(c => c.classList.remove("active"));
  if (v > 0) {
    state.deposit.amount = v;
    checkBonusHint(v);
  }
});

function checkBonusHint(amt) {
  const firstDepositDone = state.profile?.firstDepositRewarded === true;
  if (!firstDepositDone && amt >= MIN_DEPOSIT_FOR_BONUS) {
    D.depBonusHint.style.display = "block";
  } else {
    D.depBonusHint.style.display = "none";
  }
}

D.btnPayNow.addEventListener("click", async () => {
  if (state.forceUpdateActive) { showToast("Please update the app first.", "error"); return; }
  if (isBanned()) { showToast("🚫 Banned accounts cannot deposit.", "error"); return; }

  const amt = Number(D.depAmount.value);
  if (!amt || amt < MIN_DEPOSIT) { D.depErr.textContent = `Minimum deposit is ₹${MIN_DEPOSIT}.`; return; }
  if (!state.user) return;

  D.btnPayNow.disabled = true;
  D.btnPayNow.innerHTML = `<span class="spinner"></span>CREATING ORDER...`;
  D.depErr.textContent = "";
  D.utrStatusBox.className = "utr-status checking";
  D.utrStatusBox.innerHTML = `🔄 Creating PayPal order...`;
  D.utrStatusBox.classList.remove("hidden");

  try {
    const resp = await fetch(SERVER_URL + "/create-payment", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        uid: state.user.uid,
        amount: amt,
        name: state.profile?.name || "Player",
        email: state.profile?.email || "user@arenax.app",
        phone: state.profile?.phone || "9999999999"
      })
    });

    const rawText = await resp.text();
    let result;
    try { result = JSON.parse(rawText); }
    catch (parseErr) { throw new Error("Server returned invalid response."); }

    if (!result.ok) throw new Error(result.error || "Payment create failed");

    state.deposit.orderId = result.orderId;
    state.deposit.amount = amt;

    D.utrStatusBox.className = "utr-status verified";
    D.utrStatusBox.innerHTML = `✅ Redirecting to PayPal...`;
    showToast("Redirecting to PayPal...", "success");

    startDepositPolling(result.orderId, amt);

    let paymentUrl = result.paymentUrl;
    if (paymentUrl && paymentUrl.indexOf("?") === -1) paymentUrl += "?orderId=" + encodeURIComponent(result.orderId);
    else if (paymentUrl) paymentUrl += "&orderId=" + encodeURIComponent(result.orderId);

    window.location.href = paymentUrl;
  } catch (err) {
    D.utrStatusBox.className = "utr-status failed";
    D.utrStatusBox.innerHTML = `❌ Error: ${err.message}`;
    D.depErr.textContent = "Payment initiate failed.";
    D.btnPayNow.disabled = false;
    D.btnPayNow.innerHTML = `💳 PAY VIA PAYPAL`;
  }
});

function startDepositPolling(orderId, amount) {
  stopDepositPolling();
  let attempts = 0;
  state.deposit.pollTimer = setInterval(async () => {
    attempts++;
    if (attempts > 120) { stopDepositPolling(); return; }
    try {
      const pendingRef = doc(db, "pending_deposits", orderId);
      const snap = await getDoc(pendingRef);
      if (snap.exists() && snap.data().status === "COMPLETED") {
        stopDepositPolling();
        showToast(`✅ ₹${fmtMoney(amount)} credited!`, "success");
        closeModal("depositModal");
        resetDepositFlow();
      }
    } catch (e) {}
  }, 5000);
}

function stopDepositPolling() {
  if (state.deposit.pollTimer) {
    clearInterval(state.deposit.pollTimer);
    state.deposit.pollTimer = null;
  }
}

function checkPaymentRedirect() {
  const params = new URLSearchParams(window.location.search);
  const status = params.get("status");
  if (status === "success") {
    showToast("✅ Payment successful! Balance updating...", "success");
    window.history.replaceState({}, document.title, window.location.pathname);
  }
}

D.btnDeposit.addEventListener("click", () => {
  if (state.forceUpdateActive) { showToast("Please update the app first.", "error"); return; }
  if (isBanned()) { showToast("🚫 Banned accounts cannot deposit.", "error"); return; }
  resetDepositFlow();
  openModal("depositModal");
});

/* ═══════════════════════════════════════════════════════════
   PROFILE EDIT — Firebase Firestore update
═══════════════════════════════════════════════════════════ */
D.btnEditProfile.addEventListener("click", () => {
  D.profileForm.reset();
  D.pfErr.textContent = "";
  D.pfName.value = state.profile?.name || "";
  D.pfUid.value = state.profile?.gameUid || "";
  D.pfIgn.value = state.profile?.ign || "";
  openModal("profileModal");
});

D.profileForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!state.user) return;

  const name = D.pfName.value.trim();
  const uid = D.pfUid.value.trim();
  const ign = D.pfIgn.value.trim();
  D.pfErr.textContent = "";

  if (name.length < 2) { D.pfErr.textContent = "Name too short."; return; }
  if (uid && !/^[0-9]{6,15}$/.test(uid)) { D.pfErr.textContent = "Game UID must be 6-15 digits."; return; }

  D.pfSubmit.disabled = true;
  D.pfSubmit.innerHTML = `<span class="spinner"></span>SAVING...`;

  try {
    await updateDoc(doc(db, "users", state.user.uid), {
      name,
      gameUid: uid,
      ign
    });
    try { await updateProfile(state.user, { displayName: name }); } catch (e) {}
    closeModal("profileModal");
    showToast("Profile updated successfully.", "success");
  } catch (err) {
    D.pfErr.textContent = "Failed to save.";
  } finally {
    D.pfSubmit.disabled = false;
    D.pfSubmit.textContent = "SAVE CHANGES";
  }
});

/* ═══════════════════════════════════════════════════════════
   REFERRAL — COPY & SHARE
═══════════════════════════════════════════════════════════ */
D.refCopyBtn?.addEventListener("click", async () => {
  const code = D.refCode.textContent;
  if (!code || code === "—") { showToast("Referral code not loaded yet.", "error"); return; }
  const copyText = `🎮 Join ArenaX and win real cash!\n\n🎁 Use my referral code: ${code}\n\n📲 Download: ${DOWNLOAD_URL}`;
  try {
    await navigator.clipboard.writeText(copyText);
    showToast("✅ Referral code + link copied!", "success");
  } catch (e) {
    const ta = document.createElement("textarea");
    ta.value = copyText;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand("copy");
    ta.remove();
    showToast("✅ Referral code + link copied!", "success");
  }
});

D.refShareBtn?.addEventListener("click", async () => {
  const code = D.refCode.textContent;
  if (!code || code === "—") { showToast("Referral code not loaded yet.", "error"); return; }

  const shareText = `🎮 Join ArenaX and win real cash!\n\n🎁 Use my referral code: ${code}\n\n💰 You get ₹5 sign-up bonus + ₹20 first-deposit bonus!\n🏆 Compete in BGMI & Free Fire tournaments\n\n📲 Download the app now:\n${DOWNLOAD_URL}\n\nStart winning today!`;
  const shareTitle = "Join ArenaX — Win Real Cash!";

  if (navigator.share) {
    try {
      await navigator.share({ title: shareTitle, text: shareText, url: DOWNLOAD_URL });
      return;
    } catch (err) {
      if (err.name === "AbortError") return;
    }
  }
  try {
    await navigator.clipboard.writeText(shareText);
    showToast("✅ Share text copied to clipboard!", "success");
  } catch (e) {
    showToast("Copy failed.", "error");
  }
});

/* ═══════════════════════════════════════════════════════════
   SIGN OUT
═══════════════════════════════════════════════════════════ */
D.btnSignOut.addEventListener("click", async () => {
  if (!confirm("Sign out of ArenaX?")) return;
  try {
    stopDepositPolling();
    Object.keys(state.unsubs).forEach((k) => {
      if (state.unsubs[k]) { state.unsubs[k](); state.unsubs[k] = null; }
    });
    state.user = null;
    state.profile = null;
    state.tournaments = [];
    state.joinedMatches = [];
    state.transactions = [];
    state.notifications = [];
    state.referrals = [];
    state.appConfig = null;
    const banner = document.getElementById("banBanner");
    if (banner) banner.remove();
    await signOut(auth);
    showToast("Signed out successfully.", "success");
  } catch (err) {
    console.error("Sign out error:", err);
  }
});

/* ═══════════════════════════════════════════════════════════
   GLOBAL TOUCH HANDLER
═══════════════════════════════════════════════════════════ */
let lastTouch = 0;
document.addEventListener("touchend", (e) => {
  const now = Date.now();
  if (now - lastTouch <= 300) e.preventDefault();
  lastTouch = now;
}, { passive: false });

console.log(
  "%c ArenaX ",
  "background:#00e5ff;color:#050810;font-weight:bold;padding:4px 8px;border-radius:4px",
  "User App Loaded ✅"
);
</script>
</body>
</html>