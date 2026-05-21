# Resend Email Configuration Guide

## Issue Summary
The OTP email sending was failing with the error: "Failed to send verification email"

## Root Cause
The Resend account was configured with:
1. An unverified domain (`noreply.heyaurex.com`)
2. Testing mode restrictions (can only send to verified account email)

## Solution Applied

### Immediate Fix (Testing Mode)
Changed the `from` address in `backend/src/api/auth.py` from:
```python
"from": "Aurex <otp@noreply.heyaurex.com>"
```
to:
```python
"from": "Aurex <onboarding@resend.dev>"
```

This uses Resend's default onboarding domain which works in testing mode.

### Current Limitations
- **Testing Mode**: Can only send emails to `aggarwalaakriti2k@gmail.com` (the verified account email)
- **Production Ready**: No - requires domain verification for production use

## Production Setup (Required for Live Deployment)

### Step 1: Verify Your Domain
1. Go to https://resend.com/domains
2. Click "Add Domain"
3. Add `heyaurex.com`
4. Add the required DNS records to your domain registrar:
   - SPF record
   - DKIM record
   - DMARC record (optional but recommended)
5. Wait for verification (usually takes a few minutes to 24 hours)

### Step 2: Update the Code
Once your domain is verified, update `backend/src/api/auth.py`:

```python
params = {
    "from": "Aurex <noreply@heyaurex.com>",  # or otp@heyaurex.com
    "to": [email],
    "subject": "Your Aurex verification code",
    "text": f"Your Aurex verification code is: {otp_code}\n\nThis code expires in 10 minutes."
}
```

### Step 3: Upgrade Resend Plan (if needed)
- Free tier: 100 emails/day, 3,000 emails/month
- For production: Consider upgrading at https://resend.com/pricing

## Testing

### Test Script
Use the provided test script to verify email sending:

```bash
cd backend
python test_resend.py your-email@example.com
```

### Test with API
```bash
curl -X POST http://localhost:8000/api/auth/request-otp \
  -H "Content-Type: application/json" \
  -d '{"email": "aggarwalaakriti2k@gmail.com"}'
```

## Environment Variables

Ensure `.env` file has:
```env
RESEND_API_KEY=re_6iJmVFgA_8Vg7mr7gJgGXMMLWBdSuwFpS
```

## Troubleshooting

### Error: "Domain is not verified"
- Verify your domain at https://resend.com/domains
- Check DNS records are properly configured
- Wait for DNS propagation (up to 24 hours)

### Error: "Can only send to verified email"
- You're in testing mode
- Either:
  - Send only to your verified email for testing
  - Verify a domain to send to any email

### Error: "Rate limit exceeded"
- Free tier: 5 emails per second
- Upgrade plan or implement rate limiting in your app

## Security Best Practices

1. **Never commit API keys**: Use environment variables
2. **Rotate keys regularly**: Generate new keys periodically
3. **Use HTTPS**: Always use HTTPS in production
4. **Implement rate limiting**: Prevent abuse (already implemented in auth.py)
5. **Monitor usage**: Check Resend dashboard regularly

## Additional Resources

- [Resend Documentation](https://resend.com/docs)
- [Domain Verification Guide](https://resend.com/docs/dashboard/domains/introduction)
- [API Reference](https://resend.com/docs/api-reference/emails/send-email)