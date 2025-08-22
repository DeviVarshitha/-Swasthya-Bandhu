// static/app.js
document.addEventListener("DOMContentLoaded", () => {
  // ---------- DOM ----------
  const screens = Array.from(document.querySelectorAll(".screen"));
  const backBtn = document.querySelector(".back-btn");
  const nextBtn = document.querySelector(".next-btn");
  const navigation = document.getElementById("navigation");
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

  // Screen index helpers
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
  let selectedDate = null;
  let selectedTime = null;
  let calendar = null;

  // Form validation states
  const formStates = {
    register: false,
    language: false
  };

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
    // Hide navigation on splash screen
    if (currentIndex === SPLASH) {
      navigation.style.display = 'none';
      return;
    } else {
      navigation.style.display = 'flex';
    }

    backBtn.disabled = currentIndex === 0;
    
    // Disable next button based on form validation
    let canProceed = true;
    if (currentIndex === REGISTER && !formStates.register) {
      canProceed = false;
    } else if (currentIndex === LANGUAGE && !formStates.language) {
      canProceed = false;
    }
    
    nextBtn.disabled = currentIndex === screens.length - 1 || !canProceed;
  }

  function jumpTo(id) {
    const i = idx(id);
    if (i !== -1) showScreen(i);
  }

  function setStatus(el, html) {
    if (!el) return;
    el.innerHTML = html;
  }

  // ---------- TOAST MESSAGES ----------
  function showSuccessToast(message) {
    const toastEl = document.getElementById('successToast');
    const messageEl = document.getElementById('toastMessage');
    messageEl.textContent = message;
    const toast = new bootstrap.Toast(toastEl);
    toast.show();
  }

  function showErrorToast(message) {
    const toastEl = document.getElementById('errorToast');
    const messageEl = document.getElementById('errorToastMessage');
    messageEl.textContent = message;
    const toast = new bootstrap.Toast(toastEl);
    toast.show();
  }

  // ---------- FORM VALIDATION ----------
  function validateForm(form) {
    let isValid = true;
    const inputs = form.querySelectorAll('input[required], select[required]');
    
    inputs.forEach(input => {
      input.classList.remove('is-invalid');
      
      if (!input.value.trim()) {
        input.classList.add('is-invalid');
        isValid = false;
      } else if (input.type === 'tel' && input.pattern) {
        const regex = new RegExp(input.pattern);
        if (!regex.test(input.value)) {
          input.classList.add('is-invalid');
          isValid = false;
        }
      }
    });
    
    return isValid;
  }

  function setupFormValidation(form, stateKey) {
    const inputs = form.querySelectorAll('input, select');
    
    inputs.forEach(input => {
      input.addEventListener('input', () => {
        formStates[stateKey] = validateForm(form);
        updateNavButtons();
      });
    });
  }

  // ---------- TRANSLATIONS ----------
  async function applyLanguage(lang) {
    currentLanguage = lang;
    
    try {
      // Persist on session
      await fetch("/set_language", {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify({ language: lang })
      });

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

      setVoiceForLanguage(currentLanguage);
      showSuccessToast(currentTranslations.success_language || 'Language selected successfully!');
      
    } catch (error) {
      showErrorToast('Failed to set language');
    }
  }

  // ---------- SPEECH: Synthesis (TTS) ----------
  let selectedVoice = null;
  function getLangCodeFor(lang) {
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

  // ---------- ENHANCED BOOKING WITH CALENDAR ----------
  function openBookingModal(doc) {
    const modal = document.getElementById('bookingModal');
    const info = document.getElementById('bookingDoctorInfo');
    const confirmBtn = document.getElementById('confirmBooking');
    
    selectedDoctor = doc;
    selectedDate = null;
    selectedTime = null;
    
    setStatus(info, `
      <div><strong>${doc.name}</strong> — ${doc.hospital}</div>
      <div>Consultation fee: ₹${doc.consultation_fee}</div>
    `);

    // Initialize calendar if not already done
    if (!calendar) {
      calendar = flatpickr("#appointmentDate", {
        minDate: "today",
        maxDate: new Date().fp_incr(30), // 30 days from today
        dateFormat: "Y-m-d",
        onChange: function(selectedDates, dateStr) {
          selectedDate = dateStr;
          loadTimeSlots();
          updateConfirmButton();
        }
      });
    }

    // Reset form
    calendar.clear();
    document.getElementById('timeSlots').innerHTML = '';
    confirmBtn.disabled = true;

    const modalInstance = new bootstrap.Modal(modal);
    modalInstance.show();
  }

  function loadTimeSlots() {
    const slotsEl = document.getElementById('timeSlots');
    const slots = generateTimeSlots();
    
    const slotsHTML = slots.map(slot => 
      `<button class="btn btn-outline-primary btn-sm me-2 mb-2 time-slot-btn" data-time="${slot}">${slot}</button>`
    ).join('');
    
    slotsEl.innerHTML = slotsHTML;
    
    // Add event listeners to time slot buttons
    slotsEl.querySelectorAll('.time-slot-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        // Remove active class from all buttons
        slotsEl.querySelectorAll('.time-slot-btn').forEach(b => b.classList.remove('btn-primary'));
        slotsEl.querySelectorAll('.time-slot-btn').forEach(b => b.classList.add('btn-outline-primary'));
        
        // Add active class to clicked button
        btn.classList.remove('btn-outline-primary');
        btn.classList.add('btn-primary');
        
        selectedTime = btn.dataset.time;
        updateConfirmButton();
      });
    });
  }

  function generateTimeSlots() {
    const slots = [];
    let hour = 9; // Start from 9 AM
    let minute = 0;
    
    while (hour < 18) { // Until 6 PM
      const timeStr = `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
      slots.push(timeStr);
      
      minute += 30;
      if (minute >= 60) {
        hour++;
        minute = 0;
      }
    }
    
    return slots;
  }

  function updateConfirmButton() {
    const confirmBtn = document.getElementById('confirmBooking');
    confirmBtn.disabled = !selectedDate || !selectedTime;
  }

  // ---------- MAP ----------
  let map = null;
  function renderMap(doctors, focusDoctor = null) {
    const mapEl = document.getElementById("doctor-map");
    if (!mapEl) return;

    if (map) {
      map.remove();
    }

    const defaultLat = focusDoctor ? focusDoctor.lat : 17.4065;
    const defaultLng = focusDoctor ? focusDoctor.lng : 78.4772;

    map = L.map(mapEl).setView([defaultLat, defaultLng], 13);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(map);

    doctors.forEach(doc => {
      const marker = L.marker([doc.lat, doc.lng]).addTo(map);
      marker.bindPopup(`
        <div>
          <strong>${doc.name}</strong><br>
          ${doc.hospital}<br>
          Fee: ₹${doc.consultation_fee}<br>
          <button onclick="window.open('tel:${doc.phone_number}')" class="btn btn-sm btn-primary mt-1">Call</button>
        </div>
      `);
    });
  }

  // ---------- CARETAKERS ----------
  async function loadCaretakers() {
    try {
      const res = await fetch('/get_caretakers');
      const data = await res.json();
      const caretakers = data?.caretakers || [];
      renderCaretakersList(caretakers);
    } catch (e) {
      if (caretakersListEl) {
        caretakersListEl.innerHTML = '<div class="error-message">Failed to load caretakers</div>';
      }
    }
  }

  function renderCaretakersList(list) {
    if (!caretakersListEl) return;
    if (!Array.isArray(list) || list.length === 0) {
      caretakersListEl.innerHTML = '<div class="error-message">No caretakers found.</div>';
      return;
    }

    const cards = list.map(c => `
      <div class="doctor-card fade-in">
        <div class="doctor-name">${c.name}</div>
        <div class="doctor-info"><strong>Service:</strong> ${c.service_type}</div>
        <div class="doctor-info"><strong>Experience:</strong> ${c.experience} yrs</div>
        <div class="doctor-info"><strong>Rate:</strong> ₹${c.hourly_rate}/hr</div>
        <div class="doctor-info"><strong>Phone:</strong> ${c.phone_number}</div>
        <div class="mt-2">
          <button class="btn btn-primary" onclick="window.open('tel:${c.phone_number}')">Contact</button>
        </div>
      </div>
    `).join("");

    caretakersListEl.innerHTML = `<div class="doctor-grid">${cards}</div>`;
  }

  // ---------- FAMILY MANAGEMENT ----------
  async function loadFamilyMembers() {
    try {
      const res = await fetch('/get_family_members');
      const data = await res.json();
      
      if (data.success === false) {
        if (familyListEl) familyListEl.innerHTML = '<div class="error-message">Please register first</div>';
        return;
      }
      
      const members = data?.family_members || [];
      renderFamilyList(members);
      updateEmergencyContacts(members);
    } catch (e) {
      if (familyListEl) familyListEl.innerHTML = '<div class="error-message">Failed to load family members</div>';
    }
  }

  function renderFamilyList(members) {
    if (!familyListEl) return;
    
    if (members.length === 0) {
      familyListEl.innerHTML = '<div class="text-center text-muted">No family members added yet</div>';
      return;
    }

    const cards = members.map(member => `
      <div class="family-card">
        <div class="family-member-name">${member.name}</div>
        <div><strong>Relationship:</strong> ${member.relationship}</div>
        <div><strong>Phone:</strong> ${member.phone_number}</div>
        ${member.is_emergency_contact ? '<div class="badge bg-danger">Emergency Contact</div>' : ''}
        <div class="mt-2">
          <button class="btn btn-sm btn-primary" onclick="window.open('tel:${member.phone_number}')">Call</button>
        </div>
      </div>
    `).join("");

    familyListEl.innerHTML = cards;
  }

  function updateEmergencyContacts(members) {
    if (!familyEmergencyEl) return;
    
    const emergencyContacts = members.filter(m => m.is_emergency_contact);
    if (emergencyContacts.length === 0) return;

    const contactsHTML = emergencyContacts.map(contact => `
      <div class="mb-2">
        <button type="button" class="btn btn-emergency emergency-call-btn" onclick="window.open('tel:${contact.phone_number}')">
          <i class="fas fa-user"></i> ${contact.name} (${contact.relationship})
        </button>
      </div>
    `).join("");

    familyEmergencyEl.innerHTML = '<h4 class="mb-3">Family Emergency Contacts</h4>' + contactsHTML;
  }

  window.addFamilyMember = async function() {
    const form = document.getElementById('family-form');
    
    if (!validateForm(form)) {
      showErrorToast('Please fill all required fields correctly');
      return;
    }

    const formData = new FormData(form);
    const data = {
      name: formData.get('name'),
      phone_number: formData.get('phone_number'),
      relationship: formData.get('relationship'),
      is_emergency_contact: formData.get('is_emergency_contact') === 'on'
    };

    try {
      const res = await fetch('/add_family_member', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify(data)
      });

      const result = await res.json();
      
      if (result.success) {
        showSuccessToast(result.message);
        form.reset();
        bootstrap.Modal.getInstance(document.getElementById('addFamilyModal')).hide();
        loadFamilyMembers();
      } else {
        showErrorToast(result.message);
      }
    } catch (e) {
      showErrorToast('Failed to add family member');
    }
  };

  // ---------- SCREEN HANDLERS ----------
  function handleScreenEnter(index) {
    if (index === FAMILY) {
      loadFamilyMembers();
    }
  }

  // ---------- EVENT LISTENERS ----------
  
  // Auto-transition from splash after 3 seconds
  setTimeout(() => {
    if (currentIndex === SPLASH) {
      showScreen(REGISTER);
    }
  }, 3000);

  // Navigation buttons
  backBtn?.addEventListener("click", () => {
    if (currentIndex > 0) showScreen(currentIndex - 1);
  });

  nextBtn?.addEventListener("click", () => {
    if (currentIndex < screens.length - 1) {
      // Check if current screen requires validation
      if (currentIndex === REGISTER && !formStates.register) {
        showErrorToast(currentTranslations.error_fill_fields || 'Please fill all required fields');
        return;
      }
      if (currentIndex === LANGUAGE && !formStates.language) {
        showErrorToast('Please select a language');
        return;
      }
      showScreen(currentIndex + 1);
    }
  });

  // Registration form
  registerForm?.addEventListener("submit", async (e) => {
    e.preventDefault();
    
    if (!validateForm(registerForm)) {
      showErrorToast(currentTranslations.error_fill_fields || 'Please fill all required fields correctly');
      return;
    }

    const formData = new FormData(registerForm);
    const data = {
      username: formData.get('username'),
      phone_number: formData.get('phone_number')
    };

    try {
      const res = await fetch('/register', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify(data)
      });

      const result = await res.json();
      
      if (result.success) {
        formStates.register = true;
        updateNavButtons();
        showSuccessToast(currentTranslations.success_registered || result.message);
        setTimeout(() => showScreen(LANGUAGE), 1000);
      } else {
        showErrorToast(result.message);
      }
    } catch (e) {
      showErrorToast('Registration failed. Please try again.');
    }
  });

  // Language selection
  languageButtons.forEach(btn => {
    btn.addEventListener("click", async () => {
      const lang = btn.dataset.lang;
      
      // Update UI
      languageButtons.forEach(b => b.classList.remove("selected"));
      btn.classList.add("selected");
      
      formStates.language = true;
      updateNavButtons();
      
      await applyLanguage(lang);
      updateRecognizerLang();
      
      setTimeout(() => showScreen(CHAT), 1000);
    });
  });

  // Chat form
  chatForm?.addEventListener("submit", async (e) => {
    e.preventDefault();
    
    const message = chatInput.value.trim();
    if (!message) return;

    addMessage("user", message);
    chatInput.value = "";

    if (triage.active) {
      handleTriageAnswer(message);
      return;
    }

    try {
      const res = await fetch('/chat', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({ message })
      });

      const data = await res.json();
      
      if (data.success) {
        aiSay(data.response);
        if (data.specialist) {
          setTimeout(() => startTriage(data.specialist), 2000);
        }
      } else {
        aiSay("Sorry, I couldn't process your message. Please try again.");
      }
    } catch (e) {
      aiSay("Sorry, there was an error. Please try again.");
    }
  });

  // Voice button
  voiceBtn?.addEventListener("click", () => {
    if (recognizer) {
      try {
        recognizer.start();
      } catch (e) {
        showErrorToast("Voice recognition failed");
      }
    }
  });

  // SOS and Family buttons
  sosBtn?.addEventListener("click", () => jumpTo("emergency-screen"));
  familyViewBtn?.addEventListener("click", () => jumpTo("family-screen"));

  // Emergency call buttons
  document.addEventListener('click', (e) => {
    if (e.target.classList.contains('emergency-call-btn')) {
      const number = e.target.dataset.number;
      if (number) {
        window.open(`tel:${number}`);
      }
    }
  });

  // Booking confirmation
  document.getElementById('confirmBooking')?.addEventListener('click', async () => {
    if (!selectedDoctor || !selectedDate || !selectedTime) return;

    try {
      const res = await fetch('/book_appointment', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({
          doctor_id: selectedDoctor.id,
          date: selectedDate,
          time: selectedTime
        })
      });

      const result = await res.json();
      
      if (result.success) {
        showSuccessToast(result.message);
        bootstrap.Modal.getInstance(document.getElementById('bookingModal')).hide();
      } else {
        showErrorToast(result.message);
      }
    } catch (e) {
      showErrorToast('Booking failed. Please try again.');
    }
  });

  // Setup form validation
  if (registerForm) setupFormValidation(registerForm, 'register');

  // Initialize app
  setVoiceForLanguage(currentLanguage);
  updateNavButtons();
});
