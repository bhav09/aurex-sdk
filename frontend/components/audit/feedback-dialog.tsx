import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Send, Heart, Smile, Meh, Frown, Mail, Sparkles, CheckCircle2 } from "lucide-react";
import { aurexAPI } from "@/lib/api-client";
import { toast } from "sonner";

interface FeedbackDialogProps {
  isOpen: boolean;
  onClose: () => void;
  label?: string;
  userEmail?: string | null;
}

export const FeedbackDialog: React.FC<FeedbackDialogProps> = ({
  isOpen,
  onClose,
  label = "We really need your feedback!",
  userEmail,
}) => {
  const [rating, setRating] = useState<number | null>(null);
  const [comment, setComment] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const emojis = [
    { rating: 0, label: "Love It!", icon: Heart, color: "text-rose-400 hover:text-rose-300", bg: "bg-rose-500/10 border-rose-500/20", glow: "shadow-rose-500/20" },
    { rating: 1, label: "It's Okay", icon: Smile, color: "text-amber-400 hover:text-amber-300", bg: "bg-amber-500/10 border-amber-500/20", glow: "shadow-amber-500/20" },
    { rating: 2, label: "Not Great", icon: Meh, color: "text-sky-400 hover:text-sky-300", bg: "bg-sky-500/10 border-sky-500/20", glow: "shadow-sky-500/20" },
    { rating: 3, label: "Hate It", icon: Frown, color: "text-emerald-400 hover:text-emerald-300", bg: "bg-emerald-500/10 border-emerald-500/20", glow: "shadow-emerald-500/20" },
  ];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (rating === null) {
      toast.error("Please select a rating emoji.");
      return;
    }

    setIsSubmitting(true);
    try {
      await aurexAPI.submitFeedback({
        rating,
        comment,
        email: userEmail || undefined,
      });
      setSubmitted(true);
      toast.success("Feedback sent! Thank you for helping us improve Aurex.");
      setTimeout(() => {
        handleClose();
      }, 2000);
    } catch (err: any) {
      toast.error(err.message || "Failed to submit feedback. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = () => {
    setRating(null);
    setComment("");
    setSubmitted(false);
    onClose();
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          {/* Backdrop blur */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={handleClose}
            className="absolute inset-0 bg-black/70 backdrop-blur-sm"
          />

          {/* Premium Glassmorphic Card */}
          <motion.div
            initial={{ scale: 0.95, y: 15, opacity: 0 }}
            animate={{ scale: 1, y: 0, opacity: 1 }}
            exit={{ scale: 0.95, y: 15, opacity: 0 }}
            transition={{ type: "spring", duration: 0.5, bounce: 0.2 }}
            className="relative w-full max-w-[480px] overflow-hidden rounded-2xl border border-white/10 bg-card/75 backdrop-blur-md p-6 text-foreground shadow-2xl shadow-emerald-500/5 noise-overlay"
          >
            {/* Close button */}
            <button
              onClick={handleClose}
              className="absolute right-4 top-4 rounded-full border border-white/5 bg-white/5 p-1 text-muted-foreground duration-200 hover:bg-white/10 hover:text-white"
            >
              <X className="h-4 w-4" />
            </button>

            {!submitted ? (
              <form onSubmit={handleSubmit} className="flex flex-col gap-5">
                {/* Header */}
                <div className="flex flex-col gap-1.5 pr-6">
                  <div className="flex items-center gap-2">
                    <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-white/5 text-white/90">
                      <Sparkles className="h-4 w-4 text-emerald-400" />
                    </span>
                    <h3 className="font-display text-xl font-medium tracking-tight text-white">
                      Help Us Improve Aurex
                    </h3>
                  </div>
                  <p className="text-sm text-muted-foreground mt-1 leading-relaxed">
                    {label} We are constantly improving Aurex to deliver premium cost savings, and we really need your feedback!
                  </p>
                </div>

                {/* Emoji Selection */}
                <div className="flex flex-col gap-2">
                  <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    How is your experience?
                  </span>
                  <div className="grid grid-cols-4 gap-2.5 mt-1">
                    {emojis.map((emoji) => {
                      const Icon = emoji.icon;
                      const isSelected = rating === emoji.rating;

                      return (
                        <button
                          key={emoji.rating}
                          type="button"
                          onClick={() => setRating(emoji.rating)}
                          className={`group relative flex flex-col items-center justify-center gap-2 rounded-xl border py-3 duration-300 hover-lift ${
                            isSelected
                              ? `${emoji.bg} border-white/25 text-white ${emoji.glow} shadow-md`
                              : "border-white/5 bg-white/[0.02] text-muted-foreground hover:border-white/15 hover:bg-white/5"
                          }`}
                        >
                          <Icon className={`h-6 w-6 duration-300 group-hover:scale-110 ${isSelected ? emoji.color : "text-muted-foreground/80 group-hover:text-white"}`} />
                          <span className={`text-[10px] font-medium tracking-wide duration-200 ${isSelected ? "text-white" : "text-muted-foreground group-hover:text-white"}`}>
                            {emoji.label}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Comment Textarea */}
                <div className="flex flex-col gap-2">
                  <label htmlFor="comment" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Any suggestions or comments?
                  </label>
                  <textarea
                    id="comment"
                    value={comment}
                    onChange={(e) => setComment(e.target.value)}
                    placeholder="Tell us what you like or what we can improve..."
                    className="min-h-[90px] w-full rounded-xl border border-white/5 bg-white/[0.02] p-3 text-sm text-white placeholder-muted-foreground/60 duration-200 focus:border-white/20 focus:bg-white/5 focus:outline-none"
                  />
                </div>

                {/* Action Buttons & Mail Info */}
                <div className="flex items-center justify-between border-t border-white/5 pt-4 mt-1">
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground duration-200 hover:text-white">
                    <Mail className="h-3.5 w-3.5" />
                    <a href="mailto:contact@heyaurex.com" className="hover:underline font-mono">
                      contact@heyaurex.com
                    </a>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={handleClose}
                      className="rounded-xl border border-white/5 bg-transparent px-4 py-2 text-sm font-medium text-muted-foreground duration-200 hover:bg-white/5 hover:text-white"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={isSubmitting || rating === null}
                      className="flex items-center gap-1.5 rounded-xl bg-white px-4 py-2 text-sm font-medium text-black duration-200 hover:bg-white/90 disabled:opacity-50 disabled:cursor-not-allowed hover-lift"
                    >
                      {isSubmitting ? (
                        <div className="h-4 w-4 animate-spin rounded-full border-2 border-black border-t-transparent" />
                      ) : (
                        <Send className="h-3.5 w-3.5" />
                      )}
                      Send
                    </button>
                  </div>
                </div>
              </form>
            ) : (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="flex flex-col items-center justify-center py-8 text-center"
              >
                <motion.div
                  initial={{ scale: 0.8 }}
                  animate={{ scale: 1 }}
                  transition={{ type: "spring", stiffness: 200, damping: 15 }}
                >
                  <CheckCircle2 className="h-14 w-14 text-emerald-400 mb-4" />
                </motion.div>
                <h3 className="font-display text-2xl font-medium tracking-tight text-white mb-2">
                  Thank You!
                </h3>
                <p className="text-sm text-muted-foreground leading-relaxed max-w-[320px]">
                  Your feedback helps us continuously perfect the cost savings engine in Aurex. We really appreciate your time!
                </p>
              </motion.div>
            )}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};
