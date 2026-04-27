"use client";

import { cn } from "@/lib/utils";
import { useState } from "react";

export function CalendlyWidget() {
    const [selectedDate, setSelectedDate] = useState<string>("");
    const [selectedTime, setSelectedTime] = useState<string>("");
    const [formData, setFormData] = useState({
        name: "",
        email: "",
        company: "",
        message: ""
    });

    const availableDates = [
        "2026-04-28",
        "2026-04-29",
        "2026-04-30",
        "2026-05-01",
        "2026-05-02"
    ];

    const availableTimes = [
        "09:00 AM",
        "10:00 AM",
        "11:00 AM",
        "02:00 PM",
        "03:00 PM",
        "04:00 PM"
    ];

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        console.log("Booking submitted:", { selectedDate, selectedTime, ...formData });
        // Handle booking submission
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
                        Select Time (UTC)
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
                        Full Name
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
                        Email Address
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
                        Company
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
                        What would you like to discuss?
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
                    disabled={!selectedDate || !selectedTime}
                    className={cn(
                        "w-full py-4 font-medium transition-all duration-200",
                        selectedDate && selectedTime
                            ? "bg-white text-black hover:bg-white/90"
                            : "bg-white/10 text-white/30 cursor-not-allowed"
                    )}
                >
                    Confirm Booking
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