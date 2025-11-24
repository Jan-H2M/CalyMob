import { auth } from '@/lib/firebase';
import { UserRole } from '@/types/user.types';

/**
 * Data structure for creating a user via API
 */
export interface CreateUserCloudFunctionData {
  email: string;
  displayName: string;
  firstName?: string;
  lastName?: string;
  role: MembreRole;
  clubId: string;
  phoneNumber?: string;
  customPassword?: string;
  requirePasswordChange?: boolean;
}

/**
 * Response from createUser API
 */
export interface CreateUserCloudFunctionResponse {
  success: boolean;
  userId: string;
  email: string;
  password: string;
  displayName: string;
  role: MembreRole;
  message: string;
}

/**
 * Call the createUser API endpoint (Vercel Serverless Function)
 *
 * This function creates both Firebase Authentication user and Firestore document
 */
export async function callCreateUserFunction(
  data: CreateUserCloudFunctionData
): Promise<CreateUserCloudFunctionResponse> {
  try {
    // Get the current user's ID token for authentication
    const currentUser = auth.currentUser;
    if (!currentUser) {
      throw new Error('Utilisateur non authentifié');
    }

    const idToken = await currentUser.getIdToken();

    // Call the Vercel API endpoint
    const response = await fetch('/api/create-user', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${idToken}`,
      },
      body: JSON.stringify(data),
    });

    // Parse the JSON response
    const result = await response.json();

    // Handle error responses
    if (!response.ok) {
      throw new Error(result.message || `Erreur ${response.status}: ${response.statusText}`);
    }

    // Return the response data
    return result;
  } catch (error: any) {
    // Handle API errors
    console.error('Error calling createUser API:', error);

    // Rethrow with clear message
    throw new Error(error.message || 'Erreur lors de la création de l\'utilisateur');
  }
}
