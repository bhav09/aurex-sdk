"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { aurexAPI } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSlot,
} from "@/components/ui/input-otp";
import { Loader2, Mail, Chrome, ArrowRight, ShieldCheck } from "lucide-react";

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function AuthModal({ isOpen, onClose }: AuthModalProps) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [otpCode, setOtpCode] = useState("");
  
  const [step, setStep] = useState<"email" | "otp">("email");
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [infoMessage, setInfoMessage] = useState<string | null>(null);

  // Load Google Identity Services script
  useEffect(() => {
    if (!isOpen) return;
    const googleClientId = process.env.NEXT_PUBLIC_GOOGLE_OAUTH_CLIENT_ID;
    if (!googleClientId) return;

    if (document.getElementById("google-gsi-script")) return;

    const script = document.createElement("script");
    script.id = "google-gsi-script";
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    script.defer = true;
    document.head.appendChild(script);
  }, [isOpen]);

  const handleGoogleLogin = async () => {
    const googleClientId = process.env.NEXT_PUBLIC_GOOGLE_OAUTH_CLIENT_ID;
    if (!googleClientId) {
      setError("Google SSO is not configured. Please set NEXT_PUBLIC_GOOGLE_OAUTH_CLIENT_ID.");
      return;
    }

    if (typeof window === "undefined" || !(window as any).google?.accounts?.id) {
      setError("Google authentication service is still loading. Please try again in a moment.");
      return;
    }

    setGoogleLoading(true);
    setError(null);

    try {
      const google = (window as any).google;
      
      await new Promise<void>((resolve, reject) => {
        google.accounts.id.initialize({
          client_id: googleClientId,
          callback: async (response: { credential: string }) => {
            try {
              const data = await aurexAPI.loginWithGoogle(response.credential);
              aurexAPI.trackClick("landing_google_sso_success", data.user_info.email);
              
              resolve();
              onClose();
              router.push("/app");
            } catch (err: any) {
              reject(err);
            }
          },
          auto_select: false,
        });

        google.accounts.id.prompt((notification: any) => {
          if (notification.isNotDisplayed() || notification.isSkippedMoment()) {
            setError("One Tap prompt was blocked or closed. Please try again.");
            setGoogleLoading(false);
            reject(new Error("Google popup blocked/skipped"));
          }
        });
      });
    } catch (err: any) {
      setError(err.message || "Failed to sign in with Google");
      setGoogleLoading(false);
    }
  };

  const handleSendOTP = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) return;

    setLoading(true);
    setError(null);
    setInfoMessage(null);

    try {
      await aurexAPI.requestOTP(email);
      setStep("otp");
      setInfoMessage(`We've sent a 6-digit verification code to ${email}`);
    } catch (err: any) {
      setError(err.message || "Failed to send verification code. Please check your email.");
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOTP = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!otpCode || otpCode.length < 6) return;

    setLoading(true);
    setError(null);

    try {
      const data = await aurexAPI.verifyOTP(email, otpCode);
      aurexAPI.trackClick("landing_otp_verify_success", email);
      
      onClose();
      router.push("/app");
    } catch (err: any) {
      setError(err.message || "Invalid verification code. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="sm:max-w-[420px] bg-surface/95 border-white/[0.08] text-white backdrop-blur-2xl rounded-2xl shadow-2xl">
        <DialogHeader className="space-y-2 text-center">
          <DialogTitle className="text-2xl font-serif tracking-wide uppercase text-white/90">
            {step === "email" ? "Sign In to Aurex" : "Verify Code"}
          </DialogTitle>
          <DialogDescription className="text-white/60 text-sm">
            {step === "email"
              ? "Access your LLM cost intelligence ledger and control dashboard."
              : "Enter the 6-digit verification code sent to your inbox."}
          </DialogDescription>
        </DialogHeader>

        {error && (
          <div className="p-3 text-xs text-rose-400 bg-rose-500/10 border border-rose-500/20 rounded-lg">
            {error}
          </div>
        )}

        {infoMessage && (
          <div className="p-3 text-xs text-indigo-300 bg-indigo-500/10 border border-indigo-500/20 rounded-lg">
            {infoMessage}
          </div>
        )}

        {step === "email" ? (
          <div className="space-y-4 py-2">
            {/* Google SSO Button */}
            <Button
              type="button"
              variant="outline"
              disabled={googleLoading || loading}
              onClick={handleGoogleLogin}
              className="w-full flex items-center justify-center gap-2.5 h-11 bg-white/[0.03] hover:bg-white/[0.08] border-white/[0.08] hover:border-white/[0.15] text-white transition-all duration-300"
            >
              {googleLoading ? (
                <Loader2 className="w-4 h-4 animate-spin text-white/70" />
              ) : (
                <Chrome className="w-4 h-4 text-white" />
              )}
              <span>Continue with Google</span>
            </Button>

            <div className="relative flex items-center justify-center py-2">
              <span className="absolute w-full h-[1px] bg-white/[0.06]"></span>
              <span className="relative px-3 text-xs text-white/40 uppercase bg-surface font-medium tracking-widest">
                or sign in with otp
              </span>
            </div>

            {/* Email OTP form */}
            <form onSubmit={handleSendOTP} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="email" className="text-white/70 text-xs font-medium uppercase tracking-wider">
                  Email Address
                </Label>
                <div className="relative">
                  <Mail className="absolute left-3.5 top-3.5 h-4 h-4 text-white/30" />
                  <Input
                    id="email"
                    type="email"
                    required
                    placeholder="name@company.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="pl-10 h-11 bg-white/[0.02] border-white/[0.08] focus:border-white/[0.15] focus:ring-1 focus:ring-white/20 text-white placeholder-white/30 rounded-xl"
                  />
                </div>
              </div>

              <Button
                type="submit"
                disabled={loading || googleLoading || !email}
                className="w-full h-11 bg-white hover:bg-white/90 text-black font-semibold rounded-xl transition-all duration-300 shadow-[0_4px_20px_rgba(255,255,255,0.15)]"
              >
                {loading ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  <span className="flex items-center justify-center gap-1.5">
                    Send One-Time Password
                    <ArrowRight className="w-4 h-4" />
                  </span>
                )}
              </Button>
            </form>
          </div>
        ) : (
          <div className="space-y-6 py-2">
            <form onSubmit={handleVerifyOTP} className="flex flex-col items-center space-y-6">
              <div className="space-y-2 flex flex-col items-center">
                <Label className="text-white/70 text-xs font-medium uppercase tracking-wider text-center">
                  Verification Code
                </Label>
                <InputOTP
                  maxLength={6}
                  value={otpCode}
                  onChange={setOtpCode}
                  containerClassName="flex justify-center gap-2"
                >
                  <InputOTPGroup className="gap-2">
                    <InputOTPSlot index={0} className="w-11 h-11 bg-white/[0.02] border-white/[0.08] focus:border-white/20 rounded-lg text-lg text-white" />
                    <InputOTPSlot index={1} className="w-11 h-11 bg-white/[0.02] border-white/[0.08] focus:border-white/20 rounded-lg text-lg text-white" />
                    <InputOTPSlot index={2} className="w-11 h-11 bg-white/[0.02] border-white/[0.08] focus:border-white/20 rounded-lg text-lg text-white" />
                    <InputOTPSlot index={3} className="w-11 h-11 bg-white/[0.02] border-white/[0.08] focus:border-white/20 rounded-lg text-lg text-white" />
                    <InputOTPSlot index={4} className="w-11 h-11 bg-white/[0.02] border-white/[0.08] focus:border-white/20 rounded-lg text-lg text-white" />
                    <InputOTPSlot index={5} className="w-11 h-11 bg-white/[0.02] border-white/[0.08] focus:border-white/20 rounded-lg text-lg text-white" />
                  </InputOTPGroup>
                </InputOTP>
              </div>

              <div className="w-full space-y-3">
                <Button
                  type="submit"
                  disabled={loading || otpCode.length < 6}
                  className="w-full h-11 bg-white hover:bg-white/90 text-black font-semibold rounded-xl transition-all duration-300 shadow-[0_4px_20px_rgba(255,255,255,0.15)]"
                >
                  {loading ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : (
                    <span className="flex items-center justify-center gap-1.5">
                      Verify & Sign In
                      <ShieldCheck className="w-4 h-4" />
                    </span>
                  )}
                </Button>

                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setStep("email")}
                  className="w-full text-white/50 hover:text-white hover:bg-white/[0.03] text-xs h-9 transition-all duration-300"
                >
                  Back to Email
                </Button>
              </div>
            </form>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
