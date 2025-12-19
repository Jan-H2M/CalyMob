// Script simple pour créer un utilisateur de test via l'API REST
const API_KEY = 'AIzaSyCmU-7GABqko2N-2saQNcNNSIyW_BbVCtU';

async function createUser(email, password) {
  const response = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email,
        password,
        returnSecureToken: true
      })
    }
  );
  
  const data = await response.json();
  
  if (data.error) {
    if (data.error.message === 'OPERATION_NOT_ALLOWED') {
      console.error('❌ L\'authentification Email/Password n\'est pas activée !');
      console.log('\n📋 Pour l\'activer :');
      console.log('1. Allez sur : https://console.firebase.google.com/project/calycompta/authentication/providers');
      console.log('2. Cliquez sur "Email/Password"');
      console.log('3. Activez "Enable"');
      console.log('4. Cliquez "Save"');
      console.log('\nPuis relancez ce script.');
    } else if (data.error.message === 'EMAIL_EXISTS') {
      console.log('✅ L\'utilisateur existe déjà');
      return true;
    } else {
      console.error('Erreur:', data.error.message);
    }
    return false;
  }
  
  console.log('✅ Utilisateur créé avec succès !');
  console.log('   Email:', email);
  console.log('   UID:', data.localId);
  return true;
}

// Créer l'utilisateur demo
createUser('demo@calypso.be', 'demo123').then(success => {
  if (success) {
    console.log('\n🎉 Vous pouvez maintenant vous connecter avec :');
    console.log('   Email: demo@calypso.be');
    console.log('   Mot de passe: demo123');
  }
});