import os
import json
from flask import Flask, render_template, request, jsonify, session

# Create the app
app = Flask(__name__)
app.secret_key = os.environ.get("SESSION_SECRET", "healthcare_secret_key_2024")

# In-memory storage for demo purposes
users = {}
family_members = {}
chat_history = {}
doctors_data = {}
caretakers_data = {}

# OpenAI integration (mock implementation for demo)
def get_ai_response(message):
    """Mock AI response for healthcare chatbot"""
    specialists = {
        'headache': 'Neurologist',
        'fever': 'General Physician',
        'chest pain': 'Cardiologist',
        'stomach': 'Gastroenterologist',
        'joint': 'Orthopedist',
        'skin': 'Dermatologist',
        'eye': 'Ophthalmologist',
        'ear': 'ENT Specialist',
        'breathing': 'Pulmonologist',
        'heart': 'Cardiologist'
    }
    
    message_lower = message.lower()
    recommended_specialist = None
    
    for symptom, specialist in specialists.items():
        if symptom in message_lower:
            recommended_specialist = specialist
            break
    
    if recommended_specialist:
        response = f"Based on your symptoms, I recommend consulting a {recommended_specialist}. They specialize in treating conditions related to your concerns. Would you like to see available {recommended_specialist} doctors nearby?"
    else:
        response = "Thank you for sharing your concerns. For a proper diagnosis, I recommend consulting with a General Physician who can evaluate your symptoms and refer you to the appropriate specialist if needed."
        recommended_specialist = "General Physician"
    
    return response, recommended_specialist

# Translations
translations = {
    'english': {
        'app_title': 'Swasthya Bandhu',
        'welcome': 'Your Healthcare Companion',
        'register': 'Register',
        'username': 'Username',
        'phone_number': 'Phone Number',
        'enter_username': 'Enter your username',
        'enter_phone': 'Enter 10-digit phone number',
        'sos_emergency': 'SOS Emergency',
        'family_view': 'Family View',
        'select_language': 'Select Language',
        'continue': 'Continue',
        'chat_with_ai': 'Chat with AI Doctor',
        'type_message': 'Type your health concerns...',
        'send': 'Send',
        'doctors_list': 'Doctors List',
        'doctor_locations': 'Doctor Locations',
        'caretaker_details': 'Caretaker Details',
        'family_dashboard': 'Family Dashboard',
        'add_family_member': 'Add Family Member',
        'emergency_contacts': 'Emergency Contacts',
        'name': 'Name',
        'relationship': 'Relationship',
        'emergency_contact': 'Emergency Contact',
        'back': 'Back',
        'next': 'Next'
    },
    'hindi': {
        'app_title': 'स्वास्थ्य बंधु',
        'welcome': 'आपका स्वास्थ्य साथी',
        'register': 'पंजीकरण',
        'username': 'उपयोगकर्ता नाम',
        'phone_number': 'फोन नंबर',
        'enter_username': 'अपना उपयोगकर्ता नाम दर्ज करें',
        'enter_phone': '10 अंकों का फोन नंबर दर्ज करें',
        'sos_emergency': 'SOS आपातकाल',
        'family_view': 'पारिवारिक दृश्य',
        'select_language': 'भाषा चुनें',
        'continue': 'जारी रखें',
        'chat_with_ai': 'AI डॉक्टर से बात करें',
        'type_message': 'अपनी स्वास्थ्य चिंताएं लिखें...',
        'send': 'भेजें',
        'doctors_list': 'डॉक्टरों की सूची',
        'doctor_locations': 'डॉक्टर स्थान',
        'caretaker_details': 'देखभालकर्ता विवरण',
        'family_dashboard': 'पारिवारिक डैशबोर्ड',
        'add_family_member': 'परिवार का सदस्य जोड़ें',
        'emergency_contacts': 'आपातकालीन संपर्क',
        'name': 'नाम',
        'relationship': 'रिश्ता',
        'emergency_contact': 'आपातकालीन संपर्क',
        'back': 'वापस',
        'next': 'अगला'
    },
    'telugu': {
        'app_title': 'స్వాస్థ్య బంధు',
        'welcome': 'మీ ఆరోగ్య సహాయకుడు',
        'register': 'నమోదు',
        'username': 'వినియోగదారు పేరు',
        'phone_number': 'ఫోన్ నంబర్',
        'enter_username': 'మీ వినియోగదారు పేరును నమోదు చేయండి',
        'enter_phone': '10 అంకెల ఫోన్ నంబర్ నమోదు చేయండి',
        'sos_emergency': 'SOS అత్యవసర',
        'family_view': 'కుటుంబ వీక్షణ',
        'select_language': 'భాష ఎంచుకోండి',
        'continue': 'కొనసాగించు',
        'chat_with_ai': 'AI డాక్టర్‌తో చాట్ చేయండి',
        'type_message': 'మీ ఆరోగ్య సమస్యలను టైప్ చేయండి...',
        'send': 'పంపు',
        'doctors_list': 'వైద్యుల జాబితా',
        'doctor_locations': 'డాక్టర్ స్థానాలు',
        'caretaker_details': 'సంరక్షకుడి వివరాలు',
        'family_dashboard': 'కుటుంబ డాష్‌బోర్డ్',
        'add_family_member': 'కుటుంబ సభ్యుడిని జోడించండి',
        'emergency_contacts': 'అత్యవసర పరిచయాలు',
        'name': 'పేరు',
        'relationship': 'సంబంధం',
        'emergency_contact': 'అత్యవసర పరిచయం',
        'back': 'వెనుకకు',
        'next': 'తర్వాత'
    },
    'kannada': {
        'app_title': 'ಸ್ವಾಸ್ಥ್ಯ ಬಂಧು',
        'welcome': 'ನಿಮ್ಮ ಆರೋಗ್ಯ ಸಹಾಯಕ',
        'register': 'ನೋಂದಣಿ',
        'username': 'ಬಳಕೆದಾರ ಹೆಸರು',
        'phone_number': 'ಫೋನ್ ಸಂಖ್ಯೆ',
        'enter_username': 'ನಿಮ್ಮ ಬಳಕೆದಾರ ಹೆಸರನ್ನು ನಮೂದಿಸಿ',
        'enter_phone': '10 ಅಂಕಿಯ ಫೋನ್ ಸಂಖ್ಯೆಯನ್ನು ನಮೂದಿಸಿ',
        'sos_emergency': 'SOS ತುರ್ತು',
        'family_view': 'ಕುಟುಂಬ ವೀಕ್ಷಣೆ',
        'select_language': 'ಭಾಷೆ ಆಯ್ಕೆಮಾಡಿ',
        'continue': 'ಮುಂದುವರಿಸಿ',
        'chat_with_ai': 'AI ವೈದ್ಯರೊಂದಿಗೆ ಚಾಟ್ ಮಾಡಿ',
        'type_message': 'ನಿಮ್ಮ ಆರೋಗ್ಯ ಕಾಳಜಿಗಳನ್ನು ಟೈಪ್ ಮಾಡಿ...',
        'send': 'ಕಳುಹಿಸಿ',
        'doctors_list': 'ವೈದ್ಯರ ಪಟ್ಟಿ',
        'doctor_locations': 'ಡಾಕ್ಟರ್ ಸ್ಥಳಗಳು',
        'caretaker_details': 'ಆರೈಕೆದಾರ ವಿವರಗಳು',
        'family_dashboard': 'ಕುಟುಂಬ ಡ್ಯಾಶ್‌ಬೋರ್ಡ್',
        'add_family_member': 'ಕುಟುಂಬ ಸದಸ್ಯರನ್ನು ಸೇರಿಸಿ',
        'emergency_contacts': 'ತುರ್ತು ಸಂಪರ್ಕಗಳು',
        'name': 'ಹೆಸರು',
        'relationship': 'ಸಂಬಂಧ',
        'emergency_contact': 'ತುರ್ತು ಸಂಪರ್ಕ',
        'back': 'ಹಿಂದೆ',
        'next': 'ಮುಂದೆ'
    },
    'malayalam': {
        'app_title': 'സ്വാസ്ഥ്യ ബന്ധു',
        'welcome': 'നിങ്ങളുടെ ആരോഗ്യ സഹായി',
        'register': 'രജിസ്റ്റർ',
        'username': 'ഉപയോക്തൃനാമം',
        'phone_number': 'ഫോൺ നമ്പർ',
        'enter_username': 'നിങ്ങളുടെ ഉപയോക്തൃനാമം നൽകുക',
        'enter_phone': '10 അക്ക ഫോൺ നമ്പർ നൽകുക',
        'sos_emergency': 'SOS അടിയന്തരാവസ്ഥ',
        'family_view': 'കുടുംബ കാഴ്ച',
        'select_language': 'ഭാഷ തിരഞ്ഞെടുക്കുക',
        'continue': 'തുടരുക',
        'chat_with_ai': 'AI ഡോക്ടറുമായി ചാറ്റ് ചെയ്യുക',
        'type_message': 'നിങ്ങളുടെ ആരോഗ്യ ആശങ്കകൾ ടൈപ്പ് ചെയ്യുക...',
        'send': 'അയയ്ക്കുക',
        'doctors_list': 'ഡോക്ടർമാരുടെ പട്ടിക',
        'doctor_locations': 'ഡോക്ടർ സ്ഥാനങ്ങൾ',
        'caretaker_details': 'പരിചരണകർത്താവിന്റെ വിശദാംശങ്ങൾ',
        'family_dashboard': 'കുടുംബ ഡാഷ്ബോർഡ്',
        'add_family_member': 'കുടുംബാംഗത്തെ ചേർക്കുക',
        'emergency_contacts': 'അടിയന്തര കോൺടാക്റ്റുകൾ',
        'name': 'പേര്',
        'relationship': 'ബന്ധം',
        'emergency_contact': 'അടിയന്തര കോൺടാക്റ്റ്',
        'back': 'പിന്നോട്ട്',
        'next': 'അടുത്തത്'
    },
    'tamil': {
        'app_title': 'ஸ்வாஸ்த்யா பந்து',
        'welcome': 'உங்கள் சுகாதார துணை',
        'register': 'பதிவு',
        'username': 'பயனர் பெயர்',
        'phone_number': 'தொலைபேசி எண்',
        'enter_username': 'உங்கள் பயனர் பெயரை உள்ளிடவும்',
        'enter_phone': '10 இலக்க தொலைபேசி எண்ணை உள்ளிடவும்',
        'sos_emergency': 'SOS அவசரநிலை',
        'family_view': 'குடும்ப பார்வை',
        'select_language': 'மொழியைத் தேர்ந்தெடுக்கவும்',
        'continue': 'தொடரவும்',
        'chat_with_ai': 'AI மருத்துவருடன் அரட்டையடிக்கவும்',
        'type_message': 'உங்கள் சுகாதார கவலைகளை தட்டச்சு செய்யவும்...',
        'send': 'அனுப்பு',
        'doctors_list': 'மருத்துவர்களின் பட்டியல்',
        'doctor_locations': 'மருத்துவர் இடங்கள்',
        'caretaker_details': 'பராமரிப்பாளர் விவரங்கள்',
        'family_dashboard': 'குடும்ப டாஷ்போர்டு',
        'add_family_member': 'குடும்ப உறுப்பினரைச் சேர்க்கவும்',
        'emergency_contacts': 'அவசர தொடர்புகள்',
        'name': 'பெயர்',
        'relationship': 'உறவு',
        'emergency_contact': 'அவசர தொடர்பு',
        'back': 'பின்னால்',
        'next': 'அடுத்து'
    }
}

# Sample data initialization
def init_sample_data():
    global doctors_data, caretakers_data
    
    # Sample doctors data
    doctors_data = {
        'Cardiologist': [
            {'id': 1, 'name': 'Dr. Rajesh Sharma', 'experience': 15, 'hospital': 'Apollo Hospital', 'consultation_fee': 500, 'phone_number': '9876543210', 'lat': 17.4065, 'lng': 78.4772},
            {'id': 2, 'name': 'Dr. Priya Reddy', 'experience': 12, 'hospital': 'KIMS Hospital', 'consultation_fee': 600, 'phone_number': '9876543211', 'lat': 17.4075, 'lng': 78.4782}
        ],
        'Neurologist': [
            {'id': 3, 'name': 'Dr. Suresh Kumar', 'experience': 18, 'hospital': 'Care Hospital', 'consultation_fee': 700, 'phone_number': '9876543212', 'lat': 17.4085, 'lng': 78.4792},
            {'id': 4, 'name': 'Dr. Anita Singh', 'experience': 10, 'hospital': 'Rainbow Hospital', 'consultation_fee': 550, 'phone_number': '9876543213', 'lat': 17.4095, 'lng': 78.4802}
        ],
        'General Physician': [
            {'id': 5, 'name': 'Dr. Ramesh Gupta', 'experience': 8, 'hospital': 'City Hospital', 'consultation_fee': 300, 'phone_number': '9876543214', 'lat': 17.4105, 'lng': 78.4812},
            {'id': 6, 'name': 'Dr. Kavitha Rao', 'experience': 12, 'hospital': 'Metro Hospital', 'consultation_fee': 350, 'phone_number': '9876543215', 'lat': 17.4115, 'lng': 78.4822}
        ],
        'Gastroenterologist': [
            {'id': 7, 'name': 'Dr. Ramesh Gupta', 'experience': 8, 'hospital': 'City Hospital', 'consultation_fee': 300, 'phone_number': '9876543214', 'lat': 17.4105, 'lng': 78.4812},
            {'id': 8, 'name': 'Dr. Kavitha Rao', 'experience': 12, 'hospital': 'Metro Hospital', 'consultation_fee': 350, 'phone_number': '9876543215', 'lat': 17.4115, 'lng': 78.4822}
        ],
        'Hepatologist': [
            {'id': 9, 'name': 'Dr. Anil Kumar', 'experience': 10, 'hospital': 'Global Hospital', 'consultation_fee': 600, 'phone_number': '9876543216', 'lat': 17.4125, 'lng': 78.4832},
            {'id': 10, 'name': 'Dr. Meera Rani', 'experience': 15, 'hospital': 'Max Hospital', 'consultation_fee': 700, 'phone_number': '9876543217', 'lat': 17.4135, 'lng': 78.4842}
        ],
        'Dermatologist': [
            {'id': 11, 'name': 'Dr. Sneha Iyer', 'experience': 9, 'hospital': 'Skin Care Clinic', 'consultation_fee': 400, 'phone_number': '9876543218', 'lat': 17.4145, 'lng': 78.4852},
            {'id': 12, 'name': 'Dr. Vikram Singh', 'experience': 11, 'hospital': 'Derma Health Center', 'consultation_fee': 450, 'phone_number': '9876543219', 'lat': 17.4155, 'lng': 78.4862}
        ]
    }
    
    # Sample caretakers data
    caretakers_data = [
        {'id': 1, 'name': 'Mrs. Lakshmi Devi', 'specialization': 'Elderly Care', 'experience': 5, 'hourly_rate': 150, 'phone_number': '9876543220'},
        {'id': 2, 'name': 'Mr. Ravi Kumar', 'specialization': 'Patient Care', 'experience': 7, 'hourly_rate': 200, 'phone_number': '9876543221'},
        {'id': 3, 'name': 'Mrs. Sunitha Reddy', 'specialization': 'Post-Surgery Care', 'experience': 8, 'hourly_rate': 250, 'phone_number': '9876543222'}
    ]

# Routes
@app.route('/')
def index():
    return render_template('index.html')

@app.route('/init_sample_data')
def init_sample_data_route():
    init_sample_data()
    return jsonify({'success': True, 'message': 'Sample data initialized'})

@app.route('/register', methods=['POST'])
def register():
    data = request.json
    username = data.get('username')
    phone_number = data.get('phone_number')
    
    if not username or not phone_number:
        return jsonify({'success': False, 'message': 'Username and phone number are required'})
    
    if len(phone_number) != 10 or not phone_number.isdigit():
        return jsonify({'success': False, 'message': 'Phone number must be 10 digits'})
    
    user_id = len(users) + 1
    users[user_id] = {
        'id': user_id,
        'username': username,
        'phone_number': phone_number,
        'language': 'english'
    }
    
    session['user_id'] = user_id
    return jsonify({'success': True, 'message': 'Registration successful'})

@app.route('/set_language', methods=['POST'])
def set_language():
    data = request.json
    language = data.get('language', 'english')
    
    user_id = session.get('user_id')
    if user_id and user_id in users:
        users[user_id]['language'] = language
    
    session['language'] = language
    return jsonify({'success': True})

@app.route('/get_translations/<language>')
def get_translations(language):
    return jsonify({
        'success': True,
        'translations': translations.get(language, translations['english'])
    })

@app.route('/chat', methods=['POST'])
def chat():
    data = request.json
    message = data.get('message', '')
    
    user_id = session.get('user_id', 1)
    
    try:
        response, specialist = get_ai_response(message)
        
        if user_id not in chat_history:
            chat_history[user_id] = []
        
        chat_history[user_id].append({
            'user': message,
            'ai': response,
            'specialist': specialist
        })
        
        return jsonify({
            'success': True,
            'response': response,
            'recommended_specialist': specialist
        })
    except Exception as e:
        return jsonify({
            'success': False,
            'message': str(e)
        })

@app.route('/get_doctors/<specialist>')
def get_doctors(specialist):
    doctors = doctors_data.get(specialist, [])
    return jsonify({
        'success': True,
        'doctors': doctors
    })

@app.route('/get_doctor_location/<int:doctor_id>')
def get_doctor_location(doctor_id):
    for specialist_doctors in doctors_data.values():
        for doctor in specialist_doctors:
            if doctor['id'] == doctor_id:
                return jsonify({
                    'success': True,
                    'doctor': doctor
                })
    
    return jsonify({
        'success': False,
        'message': 'Doctor not found'
    })

@app.route('/get_caretakers')
def get_caretakers():
    return jsonify({
        'success': True,
        'caretakers': caretakers_data
    })

@app.route('/add_family_member', methods=['POST'])
def add_family_member():
    data = request.json
    user_id = session.get('user_id', 1)
    
    name = data.get('name')
    phone_number = data.get('phone_number')
    relationship = data.get('relationship')
    is_emergency_contact = data.get('is_emergency_contact', False)
    
    if not name or not phone_number or not relationship:
        return jsonify({'success': False, 'message': 'All fields are required'})
    
    if len(phone_number) != 10 or not phone_number.isdigit():
        return jsonify({'success': False, 'message': 'Phone number must be 10 digits'})
    
    if user_id not in family_members:
        family_members[user_id] = []
    
    member_id = len(family_members[user_id]) + 1
    family_members[user_id].append({
        'id': member_id,
        'name': name,
        'phone_number': phone_number,
        'relationship': relationship,
        'is_emergency_contact': is_emergency_contact
    })
    
    return jsonify({'success': True, 'message': 'Family member added successfully'})

@app.route('/get_family_members')
def get_family_members():
    user_id = session.get('user_id', 1)
    members = family_members.get(user_id, [])
    return jsonify({
        'success': True,
        'family_members': members
    })

if __name__ == '_main_':
    app.run(host='0.0.0.0', port=5000, debug=True)