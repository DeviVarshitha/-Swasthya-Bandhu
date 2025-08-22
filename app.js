// static/app.js
document.addEventListener("DOMContentLoaded", () => {
  // ---------- DOM ----------
  const screens = Array.from(document.querySelectorAll(".screen"));
  const backBtn = document.querySelector(".back-btn");
  const nextBtn = document.querySelector(".next-btn");
  const registerForm = document.getElementById("register-form");
  const languageButtons = document.querySelectorAll(".language-btn");
  const chatForm = document.getElementById("chat-form");
  const chatInput = document.getElementById("message-input");
  const chatMessages = document.getElementById("chat-messages");
  const voiceBtn = document.getElementById("voice-btn");
  const doctorsListEl = document.getElementById("doctors-list");
  const caretakersListEl = document.getElementById("caretakers-list");
  const familyListEl = document.getElementById("family-list");
  const familyEmergencyEl = document.getElementById("family-emergency-contacts");
  const sosBtn = document.querySelector(".sos-btn");
  const familyViewBtn = document.querySelector(".family-view-btn");

  // Screen index helpers (don’t rely on hardcoded order)
  const idx = (id) => screens.findIndex(s => s.id === id);
  const SPLASH = idx("splash-screen");
  const REGISTER = idx("register-screen");
  const LANGUAGE = idx("language-screen");
  const CHAT = idx("chat-screen");
  const DOCTORS = idx("doctors-screen");
  const MAP = idx("map-screen");
  const CARETAKER = idx("caretaker-screen");
  const FAMILY = idx("family-screen");
  const EMERGENCY = idx("emergency-screen");

  // ---------- STATE ----------
  let currentIndex = 0;
  let currentLanguage = "english";
  let currentTranslations = {};
  let doctorsCache = [];
  let selectedDoctor = null;

  // Triage flow after first AI response
  const triage = {
    active: false,
    stage: 0,
    specialist: null,
    answers: {}
  };

  // ---------- UTIL ----------
  function showScreen(index) {
    screens.forEach((screen, i) => {
      screen.classList.toggle("active", i === index);
    });
    currentIndex = index;
    updateNavButtons();
    handleScreenEnter(index);
  }

  function updateNavButtons() {
    backBtn.disabled = currentIndex === 0;
    nextBtn.disabled = currentIndex === screens.length - 1;
  }

  function jumpTo(id) {
    const i = idx(id);
    if (i !== -1) showScreen(i);
  }

  function setStatus(el, html) {
    if (!el) return;
    el.innerHTML = html;
  }

  // ---------- TRANSLATIONS ----------
  async function applyLanguage(lang) {
    currentLanguage = lang;
    // Persist on session
    await fetch("/set_language", {
      method: "POST",
      headers: {"Content-Type": "application/json"},
      body: JSON.stringify({ language: lang })
    }).catch(()=>{});

    // Pull translations
    const res = await fetch(`/get_translations/${lang}`);
    const data = await res.json();
    currentTranslations = (data && data.translations) ? data.translations : {};

    // Apply to all [data-translate] nodes
    document.querySelectorAll("[data-translate]").forEach(node => {
      const key = node.getAttribute("data-translate");
      const val = currentTranslations[key];
      if (!val) return;

      // Input-like: update placeholder
      if (node.tagName === "INPUT" || node.tagName === "TEXTAREA") {
        node.placeholder = val;
      } else {
        node.textContent = val;
      }
    });

    // Re-speak some fixed phrases in target language voice
    setVoiceForLanguage(currentLanguage);
  }

  // ---------- SPEECH: Synthesis (TTS) ----------
  let selectedVoice = null;
  function getLangCodeFor(lang) {
    // Recognition/Synthesis BCP-47 codes
    const map = {
      english: "en-IN",
      hindi: "hi-IN",
      telugu: "te-IN",
      kannada: "kn-IN",
      malayalam: "ml-IN",
      tamil: "ta-IN"
    };
    return map[lang] || "en-IN";
  }

  function chooseBestVoice(langCode) {
    // Try to choose a female voice in chosen language
    const voices = window.speechSynthesis.getVoices() || [];
    const primary = voices.find(v => v.lang.toLowerCase().startsWith(langCode.toLowerCase()) && /female|woman|zira|synthesizer/i.test(v.name));
    const anyLang = voices.find(v => v.lang.toLowerCase().startsWith(langCode.toLowerCase()));
    const googleFemale = voices.find(v => /Google.*(Female|Wavenet|Neural)/i.test(v.name) && v.lang.toLowerCase().startsWith(langCode.toLowerCase()));
    return googleFemale || primary || anyLang || voices[0] || null;
  }

  function setVoiceForLanguage(lang) {
    const langCode = getLangCodeFor(lang);
    selectedVoice = chooseBestVoice(langCode);
  }

  function speak(text) {
    if (!window.speechSynthesis || !text) return;
    const utter = new SpeechSynthesisUtterance(text);
    utter.rate = 1.02;
    utter.pitch = 1.02;
    utter.lang = selectedVoice?.lang || getLangCodeFor(currentLanguage);
    if (selectedVoice) utter.voice = selectedVoice;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utter);
  }

  window.speechSynthesis?.addEventListener("voiceschanged", () => {
    setVoiceForLanguage(currentLanguage);
  });

  // ---------- SPEECH: Recognition (STT) ----------
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  const recognizer = SR ? new SR() : null;
  if (recognizer) {
    recognizer.continuous = false;
    recognizer.interimResults = false;
    recognizer.lang = getLangCodeFor(currentLanguage);

    recognizer.onresult = (e) => {
      const transcript = e.results[0][0].transcript;
      chatInput.value = transcript;
      chatForm.dispatchEvent(new Event("submit"));
    };
    recognizer.onstart = () => voiceBtn.classList.add("recording");
    recognizer.onend = () => voiceBtn.classList.remove("recording");
  }

  function updateRecognizerLang() {
    if (recognizer) recognizer.lang = getLangCodeFor(currentLanguage);
  }

  // ---------- CHAT UI ----------
  function addMessage(role, text) {
    const wrapper = document.createElement("div");
    wrapper.className = `message ${role}`;
    const bubble = document.createElement("div");
    bubble.className = "message-content";
    bubble.textContent = text;
    wrapper.appendChild(bubble);
    chatMessages.appendChild(wrapper);
    chatMessages.scrollTop = chatMessages.scrollHeight;
  }

  function aiSay(text) {
    addMessage("ai", text);
    speak(text);
  }

  // ---------- TRIAGE ----------
  const triageQuestions = [
    "How long have you had this issue? (hours/days/weeks)",
    "On a scale of 1 to 10, how severe is it?",
    "Any other symptoms like fever, dizziness, or shortness of breath?",
  ];

  function startTriage(specialist) {
    triage.active = true;
    triage.stage = 0;
    triage.specialist = specialist;
    triage.answers = {};
    aiSay(triageQuestions[triage.stage]);
  }

  function handleTriageAnswer(answer) {
    const stage = triage.stage;
    if (stage === 0) triage.answers.duration = answer;
    if (stage === 1) triage.answers.severity = answer;
    if (stage === 2) triage.answers.other = answer;

    triage.stage++;
    if (triage.stage < triageQuestions.length) {
      aiSay(triageQuestions[triage.stage]);
    } else {
      triage.active = false;
      // Summarize and move to doctors
      aiSay("Thanks. Let me find the best nearby doctors for you.");
      loadDoctorsForSpecialist(triage.specialist);
    }
  }

  // ---------- DOCTORS ----------
  async function loadDoctorsForSpecialist(specialist) {
    try {
      const res = await fetch(`/get_doctors/${encodeURIComponent(specialist)}`);
      const data = await res.json();
      doctorsCache = data?.doctors || [];
      renderDoctorsList(doctorsCache, specialist);
      jumpTo("doctors-screen");
    } catch (e) {
      aiSay("Sorry, I couldn't fetch doctors right now.");
    }
  }

  function renderDoctorsList(list, specialist) {
    if (!doctorsListEl) return;
    if (!Array.isArray(list) || list.length === 0) {
      doctorsListEl.innerHTML = `<div class="error-message">No doctors found for ${specialist}.</div>`;
      return;
    }

    // Optionally add a utility bar
    const utility = `
      <div class="mb-2" style="text-align:right">
        <button class="btn btn-secondary" id="btn-view-map">View on Map</button>
        <button class="btn btn-secondary" id="btn-caretakers">Find Caretakers Near Me</button>
      </div>
    `;

    const cards = list.map(d => {
      const fee = `₹${(d.consultation_fee || 0).toString()}`;
      return `
        <div class="doctor-card fade-in" data-docid="${d.id}">
          <div class="doctor-name">${d.name}</div>
          <div class="doctor-info"><strong>Specialist:</strong> ${specialist}</div>
          <div class="doctor-info"><strong>Experience:</strong> ${d.experience} yrs</div>
          <div class="doctor-info"><strong>Hospital:</strong> ${d.hospital}</div>
          <div class="doctor-info"><strong>Fee:</strong> ${fee}</div>
          <div class="doctor-info"><strong>Phone:</strong> ${d.phone_number}</div>
          <div class="mt-2">
            <button class="btn btn-primary btn-book" data-id="${d.id}">Book Appointment</button>
            <button class="btn btn-secondary btn-map" data-id="${d.id}">View on Map</button>
          </div>
        </div>
      `;
    }).join("");

    doctorsListEl.innerHTML = utility + `<div class="doctor-grid">${cards}</div>`;

    // Handlers
    doctorsListEl.querySelectorAll(".btn-book").forEach(btn => {
      btn.addEventListener("click", () => {
        const id = parseInt(btn.dataset.id);
        const doc = doctorsCache.find(d => d.id === id);
        if (doc) openBookingModal(doc);
      });
    });
    doctorsListEl.querySelectorAll(".btn-map").forEach(btn => {
      btn.addEventListener("click", () => {
        const id = parseInt(btn.dataset.id);
        const doc = doctorsCache.find(d => d.id === id);
        if (doc) {
          selectedDoctor = doc;
          renderMap(doctorsCache, selectedDoctor);
          jumpTo("map-screen");
        }
      });
    });

    const btnViewMap = document.getElementById("btn-view-map");
    if (btnViewMap) btnViewMap.addEventListener("click", () => {
      selectedDoctor = null;
      renderMap(doctorsCache, null);
      jumpTo("map-screen");
    });

    const btnCaretakers = document.getElementById("btn-caretakers");
    if (btnCaretakers) btnCaretakers.addEventListener("click", () => {
      loadCaretakers();
      jumpTo("caretaker-screen");
    });
  }

  // ---------- BOOKING ----------
  function ensureBookingModal() {
    if (document.getElementById("bookingModal")) return;

    const modalHTML = `
      <div class="modal fade" id="bookingModal" tabindex="-1">
        <div class="modal-dialog">
          <div class="modal-content">
            <div class="modal-header">
              <h5 class="modal-title">Book Appointment</h5>
              <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
            </div>
            <div class="modal-body">
              <div id="bookingDoctorInfo" class="mb-3"></div>
              <div id="bookingSlots"></div>
              <div id="bookingStatus" class="mt-3"></div>
            </div>
            <div class="modal-footer">
              <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Close</button>
            </div>
          </div>
        </div>
      </div>`;
    document.body.insertAdjacentHTML("beforeend", modalHTML);
  }

  function slotTimes() {
    // 30-min slots from 10:00 to 18:00
    const slots = [];
    let h = 10, m = 0;
    while (h < 18 || (h === 18 && m === 0)) {
      const hh = String(h).padStart(2,"0");
      const mm = String(m).padStart(2,"0");
      slots.push(`${hh}:${mm}`);
      m += 30;
      if (m >= 60) { h += 1; m = 0; }
      if (h === 18 && m > 0) break;
    }
    return slots;
  }

  function openBookingModal(doc) {
    ensureBookingModal();
    const info = document.getElementById("bookingDoctorInfo");
    const slotsEl = document.getElementById("bookingSlots");
    const status = document.getElementById("bookingStatus");

    setStatus(info, `
      <div><strong>${doc.name}</strong> — ${doc.hospital}</div>
      <div>Consultation fee: ₹${doc.consultation_fee}</div>
    `);

    const grid = slotTimes().map(t =>
      `<button class="btn btn-primary m-1 btn-slot" data-time="${t}">${t}</button>`
    ).join("");

    setStatus(slotsEl, `<div class="d-flex flex-wrap">${grid}</div>`);
    setStatus(status, "");

    slotsEl.querySelectorAll(".btn-slot").forEach(btn => {
      btn.addEventListener("click", () => {
        setStatus(status, `<div class="success-message">✅ Appointment booked with <strong>${doc.name}</strong> at <strong>${btn.dataset.time}</strong>.</div>`);
        speak(`Your appointment is booked at ${btn.dataset.time}.`);
      });
    });

    const modalEl = document.getElementById("bookingModal");
    const modal = bootstrap.Modal.getOrCreateInstance(modalEl);
    modal.show();
  }

  // ---------- MAP ----------
  let map, mapMarkers = [];
  function ensureMap() {
    if (map) return;
    map = L.map("doctor-map");
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "© OpenStreetMap"
    }).addTo(map);
    map.setView([17.4065, 78.4772], 12);
  }

  function clearMarkers() {
    mapMarkers.forEach(m => m.remove());
    mapMarkers = [];
  }

  function renderMap(list, highlightDoctor) {
    ensureMap();
    clearMarkers();
    if (!list || list.length === 0) {
      map.setView([17.4065, 78.4772], 12);
      return;
    }

    const bounds = [];
    list.forEach(d => {
      const marker = L.marker([d.lat, d.lng]).addTo(map);
      const html = `
        <div style="min-width:200px">
          <div><strong>${d.name}</strong></div>
          <div>${d.hospital}</div>
          <div>Fee: ₹${d.consultation_fee}</div>
          <div class="mt-1">
            <button class="btn btn-primary btn-sm btn-book-map" data-id="${d.id}">Book</button>
          </div>
        </div>`;
      marker.bindPopup(html);
      marker.on("popupopen", () => {
        const btn = document.querySelector(".btn-book-map[data-id='" + d.id + "']");
        if (btn) btn.addEventListener("click", () => openBookingModal(d));
      });
      mapMarkers.push(marker);
      bounds.push([d.lat, d.lng]);
    });

    if (bounds.length > 1) {
      map.fitBounds(bounds, { padding: [30,30] });
    } else {
      map.setView(bounds[0], 14);
    }

    if (highlightDoctor) {
      const mk = mapMarkers.find((_, i) => list[i].id === highlightDoctor.id);
      if (mk) {
        mk.openPopup();
      }
    }
  }

  // ---------- CARETAKERS ----------
  async function loadCaretakers() {
    try {
      const res = await fetch("/get_caretakers");
      const data = await res.json();
      const list = data?.caretakers || [];
      if (!caretakersListEl) return;

      if (list.length === 0) {
        caretakersListEl.innerHTML = `<div class="error-message">No caretakers found.</div>`;
        return;
      }

      caretakersListEl.innerHTML = `
        ${list.map(c => `
          <div class="doctor-card fade-in">
            <div class="doctor-name">${c.name}</div>
            <div class="doctor-info"><strong>Specialization:</strong> ${c.specialization}</div>
            <div class="doctor-info"><strong>Experience:</strong> ${c.experience} yrs</div>
            <div class="doctor-info"><strong>Rate:</strong> ₹${c.hourly_rate}/hour</div>
            <div class="doctor-info"><strong>Phone:</strong> ${c.phone_number}</div>
            <div class="mt-2">
              <a class="btn btn-primary" href="tel:${c.phone_number}">Call</a>
            </div>
          </div>
        `).join("")}
      `;
    } catch (e) {
      caretakersListEl.innerHTML = `<div class="error-message">Failed to load caretakers.</div>`;
    }
  }

  // ---------- FAMILY ----------
  async function loadFamily() {
    try {
      const res = await fetch("/get_family_members");
      const data = await res.json();
      const list = data?.family_members || [];

      if (familyListEl) {
        familyListEl.innerHTML = list.length ? list.map(m => `
          <div class="family-card">
            <div class="family-member-name">${m.name}</div>
            <div>${m.relationship}</div>
            <div>Phone: ${m.phone_number}</div>
            ${m.is_emergency_contact ? `<div class="mt-2"><span class="success-message" style="display:inline-block">Emergency Contact</span></div>` : ""}
          </div>
        `).join("") : `<div class="text-muted">No family members yet.</div>`;
      }

      if (familyEmergencyEl) {
        const emer = list.filter(m => m.is_emergency_contact);
        familyEmergencyEl.innerHTML = emer.length ? emer.map(m => `
          <div class="mb-2">
            <a class="btn btn-emergency emergency-call-btn" href="tel:${m.phone_number}">
              <i class="fas fa-phone"></i> Call ${m.name} (${m.relationship})
            </a>
          </div>
        `).join("") : `<div class="text-muted">No family emergency contacts set.</div>`;
      }
    } catch (e) {
      if (familyListEl) familyListEl.innerHTML = `<div class="error-message">Failed to load family.</div>`;
    }
  }

  // Needed by the HTML modal's onclick
  window.addFamilyMember = async function addFamilyMember() {
    const form = document.getElementById("family-form");
    const fd = new FormData(form);
    const payload = {
      name: fd.get("name")?.toString().trim(),
      phone_number: fd.get("phone_number")?.toString().trim(),
      relationship: fd.get("relationship"),
      is_emergency_contact: !!fd.get("is_emergency_contact")
    };
    try {
      const res = await fetch("/add_family_member", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (data.success) {
        await loadFamily();
        const modalEl = document.getElementById("addFamilyModal");
        bootstrap.Modal.getInstance(modalEl)?.hide();
        form.reset();
      } else {
        alert(data.message || "Failed to add member");
      }
    } catch {
      alert("Failed to add member");
    }
  };

  // ---------- SCREEN ENTER HOOK ----------
  function handleScreenEnter(index) {
    if (index === DOCTORS) {
      // nothing; rendered by chat flow
    } else if (index === MAP) {
      renderMap(doctorsCache, selectedDoctor);
    } else if (index === CARETAKER) {
      loadCaretakers();
    } else if (index === FAMILY) {
      loadFamily();
    } else if (index === EMERGENCY) {
      loadFamily(); // to refresh emergency contact buttons
      // attach tel: to static emergency buttons
      document.querySelectorAll(".emergency-call-btn").forEach(btn => {
        btn.addEventListener("click", () => {
          const n = btn.getAttribute("data-number");
          if (n) window.location.href = `tel:${n}`;
        }, { once: true });
      });
    }
  }

  // ---------- INIT SAMPLE DATA ----------
  // Ensure doctors/caretakers data is present
  fetch("/init_sample_data").catch(()=>{});

  // ---------- FLOW ----------
  // splash → register after 5s
  setTimeout(() => showScreen(REGISTER), 5000);

  // Back/Next
  nextBtn.addEventListener("click", () => {
    if (currentIndex < screens.length - 1) showScreen(currentIndex + 1);
  });
  backBtn.addEventListener("click", () => {
    if (currentIndex > 0) showScreen(currentIndex - 1);
  });

  // SOS + Family buttons on Register screen
  if (sosBtn) sosBtn.addEventListener("click", () => jumpTo("emergency-screen"));
  if (familyViewBtn) familyViewBtn.addEventListener("click", () => jumpTo("family-screen"));

  // Registration submit → Language screen
  if (registerForm) {
    registerForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const username = document.getElementById("username").value.trim();
      const phone_number = document.getElementById("phone_number").value.trim();

      if (!username || !phone_number) {
        alert("Please enter both username and phone number");
        return;
      }
      try {
        const res = await fetch("/register", {
          method: "POST",
          headers: {"Content-Type": "application/json"},
          body: JSON.stringify({ username, phone_number })
        });
        const data = await res.json();
        if (data.success) {
          alert("Registration successful!");
          showScreen(LANGUAGE);
        } else {
          alert(data.message || "Registration failed.");
        }
      } catch {
        alert("Something went wrong. Please try again.");
      }
    });
  }

  // Language selection → set language, update UI, go to Chat
  languageButtons.forEach(btn => {
    btn.addEventListener("click", async () => {
      languageButtons.forEach(b => b.classList.remove("selected"));
      btn.classList.add("selected");
      await applyLanguage(btn.dataset.lang);
      updateRecognizerLang();
      showScreen(CHAT);
      // greeting
      aiSay("Hello! Please describe your problem. I will ask a few quick questions and then suggest nearby doctors.");
    });
  });

  // Voice mic button
  if (voiceBtn) {
    voiceBtn.addEventListener("click", () => {
      if (!recognizer) {
        alert("Speech recognition not supported in this browser.");
        return;
      }
      try {
        recognizer.lang = getLangCodeFor(currentLanguage);
        recognizer.start();
      } catch {
        // ignore if already started
      }
    });
  }

  // Chat submit
  if (chatForm) {
    chatForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const msg = chatInput.value.trim();
      if (!msg) return;

      addMessage("user", msg);
      chatInput.value = "";

      // If we're in triage, treat as answers
      if (triage.active) {
        handleTriageAnswer(msg);
        return;
      }

      // --- Symptom to Specialist mapping ---
      const symptomMap = [
        { keywords: ["leg pain", "legs pain", "knee pain", "joint pain", "bone", "fracture", "orthopedic", "orthopedician"], specialist: "Orthopedician" },
        { keywords: ["heart", "chest pain", "cardio", "cardiologist", "palpitation"], specialist: "Cardiologist" },
        { keywords: ["fever", "cold", "cough", "general", "physician"], specialist: "General Physician" },
        { keywords: ["skin", "rash", "dermatologist", "itch", "acne"], specialist: "Dermatologist" },
        { keywords: ["eye", "vision", "ophthalmologist", "blurry"], specialist: "Ophthalmologist" },
        { keywords: ["child", "baby", "pediatrician", "pediatric"], specialist: "Pediatrician" },
        { keywords: ["pregnancy", "gynecologist", "women", "period"], specialist: "Gynecologist" },
        { keywords: ["diabetes", "sugar", "endocrinologist", "thyroid"], specialist: "Endocrinologist" },
        { keywords: ["mental", "depression", "psychiatrist", "anxiety", "stress"], specialist: "Psychiatrist" }
      ];
      const lowerMsg = msg.toLowerCase();
      let matchedSpecialist = null;
      for (const entry of symptomMap) {
        if (entry.keywords.some(k => lowerMsg.includes(k))) {
          matchedSpecialist = entry.specialist;
          break;
        }
      }
      if (matchedSpecialist) {
        aiSay(`Based on your symptoms, I recommend consulting a ${matchedSpecialist}. Let me ask a few quick questions.`);
        startTriage(matchedSpecialist);
        return;
      }

      // --- Fallback to server AI ---
      try {
        const res = await fetch("/chat", {
          method: "POST",
          headers: {"Content-Type": "application/json"},
          body: JSON.stringify({ message: msg })
        });
        const data = await res.json();
        if (!data.success) {
          aiSay("Sorry, I couldn't process that right now.");
          return;
        }
        const reply = data.response;
        const specialist = data.recommended_specialist || "General Physician";
        aiSay(reply);
        // Start triage then load doctors
        startTriage(specialist);
      } catch {
        aiSay("Sorry, I couldn't connect to the server.");
      }
    });
  }

  // ---------- INITIAL UI ----------
  showScreen(SPLASH);
  setVoiceForLanguage(currentLanguage);
});
