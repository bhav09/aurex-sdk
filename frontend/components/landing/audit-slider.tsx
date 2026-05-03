"use client";

import React from "react";
import { ImageComparison } from "./ImageComparison";

export function AuditSlider() {
    return (
        <div className="w-full py-16 bg-black text-white">

            {/* Title */}
            <div className="text-center mb-10">
                <h2 className="text-4xl font-semibold">
                    Cut Your AI Costs Instantly
                </h2>
                <p className="text-gray-400 mt-2">
                    Drag to compare before and after optimization
                </p>
            </div>

            {/* Labels */}
            <div className="flex justify-between max-w-4xl mx-auto mb-4 px-2">
                <span className="bg-gray-700 px-4 py-1 rounded-full text-sm">
                    Without Audit
                </span>
                <span className="bg-gray-700 px-4 py-1 rounded-full text-sm">
                    With Audit
                </span>
            </div>

            {/* Slider */}
            <ImageComparison
                beforeImage="/before-audit.png"
                afterImage="/after-audit.png"
            />

            
        </div>
    );
}
