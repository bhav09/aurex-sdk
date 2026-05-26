#!/usr/bin/env python3
"""
Test script to verify Resend API configuration and email sending.
"""
import os
import sys
from dotenv import load_dotenv
import resend

# Load environment variables
load_dotenv()

def test_resend_config():
    """Test Resend API configuration"""
    api_key = os.getenv("RESEND_API_KEY")
    
    print("=" * 60)
    print("Resend API Configuration Test")
    print("=" * 60)
    
    if not api_key:
        print("❌ RESEND_API_KEY is not set in .env file")
        return False
    
    print(f"✓ RESEND_API_KEY is set: {api_key[:10]}...")
    
    # Set the API key
    resend.api_key = api_key
    
    return True

def test_send_email(test_email: str = None):
    """Test sending an email via Resend"""
    if not test_resend_config():
        return
    
    if not test_email:
        test_email = input("\nEnter your email address to test: ").strip()
    
    print(f"\n📧 Attempting to send test email to: {test_email}")
    
    try:
        params = {
            "from": "Aurex <onboarding@resend.dev>",
            "to": [test_email],
            "subject": "Test: Your Aurex verification code",
            "text": "Your Aurex verification code is: 123456 This is a test email. This code expires in 10 minutes."
        }
        
        response = resend.Emails.send(params)
        print(f"✅ Email sent successfully!")
        print(f"Response: {response}")
        
    except Exception as e:
        print(f"❌ Failed to send email")
        print(f"Error type: {type(e).__name__}")
        print(f"Error message: {str(e)}")
        print("\nPossible issues:")
        print("1. Domain 'noreply.heyaurex.com' is not verified in Resend")
        print("2. API key doesn't have permission to send emails")
        print("3. Resend account is not properly configured")
        print("\nTo fix:")
        print("- Go to https://resend.com/domains")
        print("- Verify your domain 'heyaurex.com'")
        print("- Or use a verified domain in the 'from' field")
        return False
    
    return True

if __name__ == "__main__":
    if len(sys.argv) > 1:
        test_send_email(sys.argv[1])
    else:
        test_send_email()

# Made with Bob
