"use client";

import { cn } from "@/lib/utils";
import { useState, useEffect } from "react";

export function CalendlyWidget() {
    const [selectedDate, setSelectedDate] = useState<string>("");
    const [selectedTime, setSelectedTime] = useState<string>("");
    const [formData, setFormData] = useState({
        name: "",
        email: "",
        company: "",
        message: ""
    });

    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isSuccess, setIsSuccess] = useState(false);

    const [availableDates, setAvailableDates] = useState<string[]>([]);

    useEffect(() => {
        const dates = Array.from({ length: 5 }).map((_, i) => {
            const d = new Date();
            d.setDate(d.getDate() + i + 2);
            return d.toISOString().split("T")[0];
        });
        setAvailableDates(dates);
    }, []);

    const availableTimes = [
        "02:30 PM",
        "03:30 PM",
        "04:30 PM",
        "07:30 PM",
        "08:30 PM",
        "09:30 PM",
        "02:30 AM",
        "03:30 AM"
    ];

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsSubmitting(true);

        try {
            // Replace mnjwznyb with process.env.NEXT_PUBLIC_FORMSPREE_ID or hardcode it once you have it
            const formId = process.env.NEXT_PUBLIC_FORMSPREE_ID || "mnjwznyb";
            const response = await fetch(`https://formspree.io/f/${formId}`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Accept: "application/json",
                },
                body: JSON.stringify({
                    name: formData.name,
                    email: formData.email,
                    company: formData.company || 'N/A',
                    date: selectedDate,
                    time: selectedTime,
                    message: formData.message || 'N/A',
                    _subject: `New Booking Request from ${formData.name}`
                }),
            });

            if (response.ok) {
                setIsSuccess(true);
                setFormData({ name: "", email: "", company: "", message: "" });
            } else {
                console.error("Form submission failed");
                alert("Something went wrong. Please try again.");
            }
        } catch (error) {
            console.error("Error submitting form", error);
            alert("Something went wrong. Please try again.");
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="grid lg:grid-cols-2 gap-8">
            {/* Date & Time Selection */}
            <div className="space-y-6">
                <div>
                    <label className="block text-sm font-mono text-white/60 mb-3">
                        Select Date
                    </label>
                    <div className="grid grid-cols-2 gap-3">
                        {availableDates.map((date) => (
                            <button
                                key={date}
                                type="button"
                                onClick={() => setSelectedDate(date)}
                                className={cn(
                                    "p-4 border transition-all duration-200 text-left",
                                    selectedDate === date
                                        ? "border-[#eca8d6] bg-[#eca8d6]/10"
                                        : "border-white/10 bg-black/40 hover:border-white/30"
                                )}
                            >
                                <div className="text-xs text-white/40 mb-1">
                                    {new Date(date).toLocaleDateString("en-US", { weekday: "short" })}
                                </div>
                                <div className="font-mono">
                                    {new Date(date).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                                </div>
                            </button>
                        ))}
                    </div>
                </div>

                <div>
                    <label className="block text-sm font-mono text-white/60 mb-3">
                        Select Time (IST)
                    </label>
                    <div className="grid grid-cols-3 gap-3">
                        {availableTimes.map((time) => (
                            <button
                                key={time}
                                type="button"
                                onClick={() => setSelectedTime(time)}
                                disabled={!selectedDate}
                                className={cn(
                                    "p-3 border transition-all duration-200 text-sm font-mono",
                                    selectedTime === time
                                        ? "border-[#eca8d6] bg-[#eca8d6]/10"
                                        : "border-white/10 bg-black/40 hover:border-white/30",
                                    !selectedDate && "opacity-30 cursor-not-allowed"
                                )}
                            >
                                {time}
                            </button>
                        ))}
                    </div>
                </div>
            </div>

            {/* Contact Form */}
            <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                    <label htmlFor="name" className="block text-sm font-mono text-white/60 mb-2">
                        Full Name <span className="text-[#eca8d6]">*</span>
                    </label>
                    <input
                        type="text"
                        id="name"
                        required
                        value={formData.name}
                        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                        className="w-full px-4 py-3 bg-black/40 border border-white/10 text-white placeholder:text-white/30 focus:border-[#eca8d6] focus:outline-none transition-colors"
                        placeholder="John Doe"
                    />
                </div>

                <div>
                    <label htmlFor="email" className="block text-sm font-mono text-white/60 mb-2">
                        Email Address <span className="text-[#eca8d6]">*</span>
                    </label>
                    <input
                        type="email"
                        id="email"
                        required
                        value={formData.email}
                        onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                        className="w-full px-4 py-3 bg-black/40 border border-white/10 text-white placeholder:text-white/30 focus:border-[#eca8d6] focus:outline-none transition-colors"
                        placeholder="john@company.com"
                    />
                </div>

                <div>
                    <label htmlFor="company" className="block text-sm font-mono text-white/60 mb-2">
                        Company <span className="text-white/40">(Optional)</span>
                    </label>
                    <input
                        type="text"
                        id="company"
                        value={formData.company}
                        onChange={(e) => setFormData({ ...formData, company: e.target.value })}
                        className="w-full px-4 py-3 bg-black/40 border border-white/10 text-white placeholder:text-white/30 focus:border-[#eca8d6] focus:outline-none transition-colors"
                        placeholder="Acme Inc."
                    />
                </div>

                <div>
                    <label htmlFor="message" className="block text-sm font-mono text-white/60 mb-2">
                        What would you like to discuss? <span className="text-white/40">(Optional)</span>
                    </label>
                    <textarea
                        id="message"
                        rows={4}
                        value={formData.message}
                        onChange={(e) => setFormData({ ...formData, message: e.target.value })}
                        className="w-full px-4 py-3 bg-black/40 border border-white/10 text-white placeholder:text-white/30 focus:border-[#eca8d6] focus:outline-none transition-colors resize-none"
                        placeholder="Tell us about your AI infrastructure and optimization goals..."
                    />
                </div>

                <button
                    type="submit"
                    disabled={!selectedDate || !selectedTime || isSubmitting || isSuccess}
                    className={cn(
                        "w-full py-4 font-medium transition-all duration-200",
                        selectedDate && selectedTime && !isSuccess
                            ? "bg-white text-black hover:bg-white/90"
                            : "bg-white/10 text-white/30 cursor-not-allowed",
                        isSuccess && "bg-green-500/20 text-green-400 border border-green-500/30"
                    )}
                >
                    {isSubmitting ? "Submitting..." : isSuccess ? "Booking Confirmed!" : "Confirm Booking"}
                </button>

                {selectedDate && selectedTime && (
                    <p className="text-xs text-white/40 text-center">
                        You'll receive a confirmation email with meeting details
                    </p>
                )}
            </form>
        </div>
    );
}

// Made with Bob