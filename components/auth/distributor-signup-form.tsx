"use client"

import type React from "react"
import { useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useToast } from "@/hooks/use-toast"

interface FormData {
  // Account Info
  email: string
  password: string
  confirmPassword: string
  fullName: string
  phone: string
  // Company Info
  companyName: string
  licenseNumber: string
  gstNumber: string
  // Address Info
  streetAddress: string
  landmark: string
  city: string
  state: string
  pincode: string
  // Service Areas
  serviceAreas: string
}

export function DistributorSignUpForm() {
  const [step, setStep] = useState(1)
  const [formData, setFormData] = useState<FormData>({
    email: "",
    password: "",
    confirmPassword: "",
    fullName: "",
    phone: "",
    companyName: "",
    licenseNumber: "",
    gstNumber: "",
    streetAddress: "",
    landmark: "",
    city: "",
    state: "",
    pincode: "",
    serviceAreas: "",
  })
  const [isLoading, setIsLoading] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const router = useRouter()
  const { toast } = useToast()

  const validateStep1 = (): boolean => {
    const stepErrors: Record<string, string> = {}

    if (!formData.fullName.trim()) {
      stepErrors.fullName = "Full name is required"
    }

    if (!formData.email.trim()) {
      stepErrors.email = "Email is required"
    } else if (!formData.email.includes("@")) {
      stepErrors.email = "Invalid email format"
    }

    if (!formData.phone.trim()) {
      stepErrors.phone = "Phone number is required"
    } else if (formData.phone.replace(/\D/g, "").length < 10) {
      stepErrors.phone = "Phone number must be at least 10 digits"
    }

    if (!formData.password) {
      stepErrors.password = "Password is required"
    } else if (formData.password.length < 8) {
      stepErrors.password = "Password must be at least 8 characters"
    }

    if (formData.password !== formData.confirmPassword) {
      stepErrors.confirmPassword = "Passwords do not match"
    }

    setErrors(stepErrors)
    return Object.keys(stepErrors).length === 0
  }

  const validateStep2 = (): boolean => {
    const stepErrors: Record<string, string> = {}

    if (!formData.companyName.trim()) {
      stepErrors.companyName = "Company name is required"
    }

    if (!formData.licenseNumber.trim()) {
      stepErrors.licenseNumber = "License number is required"
    }

    if (!formData.gstNumber.trim()) {
      stepErrors.gstNumber = "GST number is required"
    } else if (!/^\d{2}[A-Z]{5}\d{4}[A-Z]{1}[A-Z\d]{1}[Z]{1}[A-Z\d]{1}$/.test(formData.gstNumber)) {
      stepErrors.gstNumber = "Invalid GST format (e.g., 27AAFHU5055K1Z5)"
    }

    setErrors(stepErrors)
    return Object.keys(stepErrors).length === 0
  }

  const validateStep3 = (): boolean => {
    const stepErrors: Record<string, string> = {}

    if (!formData.streetAddress.trim()) {
      stepErrors.streetAddress = "Street address is required"
    }

    if (!formData.city.trim()) {
      stepErrors.city = "City is required"
    }

    if (!formData.state.trim()) {
      stepErrors.state = "State is required"
    }

    if (!formData.pincode.trim()) {
      stepErrors.pincode = "Pincode is required"
    } else if (!/^\d{6}$/.test(formData.pincode)) {
      stepErrors.pincode = "Invalid pincode format"
    }

    if (!formData.serviceAreas.trim()) {
      stepErrors.serviceAreas = "Service areas are required"
    }

    setErrors(stepErrors)
    return Object.keys(stepErrors).length === 0
  }

  const handleNext = () => {
    if (step === 1 && validateStep1()) {
      setStep(2)
    } else if (step === 2 && validateStep2()) {
      setStep(3)
    }
  }

  const handleBack = () => {
    if (step > 1) {
      setStep(step - 1)
      setErrors({})
    }
  }

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name } = e.target
    // CSS text-transform only changes how GST looks; the stored value stayed lowercase and failed the regex.
    const value = name === "gstNumber" ? e.target.value.replace(/\s/g, "").toUpperCase() : e.target.value
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }))
    // Clear error for this field when user starts typing
    if (errors[name]) {
      setErrors((prev) => ({
        ...prev,
        [name]: "",
      }))
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!validateStep3()) {
      return
    }

    setIsLoading(true)

    try {
      const response = await fetch("/api/distributor/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      })

      const data = await response.json()

      if (response.ok) {
        toast({
          title: "Success",
          description: "Account created successfully! Please verify your email.",
        })
        router.push("/distributor/dashboard")
        router.refresh()
      } else {
        toast({
          title: "Error",
          description: data.error || "Failed to create account",
          variant: "destructive",
        })
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Something went wrong. Please try again.",
        variant: "destructive",
      })
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Step 1: Account Information */}
      {step === 1 && (
        <div className="space-y-4">
          <div className="mb-6">
            <h2 className="text-lg font-semibold">Step 1 of 3: Account Information</h2>
            <p className="text-sm text-muted-foreground mt-1">Create your distributor account</p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="fullName">Full Name *</Label>
            <Input
              id="fullName"
              name="fullName"
              type="text"
              placeholder="John Doe"
              value={formData.fullName}
              onChange={handleChange}
            />
            {errors.fullName && <p className="text-sm text-destructive">{errors.fullName}</p>}
          </div>

          <div className="space-y-2">
            <Label htmlFor="email">Email Address *</Label>
            <Input
              id="email"
              name="email"
              type="email"
              placeholder="john@company.com"
              value={formData.email}
              onChange={handleChange}
            />
            {errors.email && <p className="text-sm text-destructive">{errors.email}</p>}
          </div>

          <div className="space-y-2">
            <Label htmlFor="phone">Phone Number *</Label>
            <Input
              id="phone"
              name="phone"
              type="tel"
              placeholder="+91 9876543210"
              value={formData.phone}
              onChange={handleChange}
            />
            {errors.phone && <p className="text-sm text-destructive">{errors.phone}</p>}
          </div>

          <div className="space-y-2">
            <Label htmlFor="password">Password *</Label>
            <Input
              id="password"
              name="password"
              type="password"
              placeholder="••••••••"
              value={formData.password}
              onChange={handleChange}
            />
            <p className="text-xs text-muted-foreground">Minimum 8 characters</p>
            {errors.password && <p className="text-sm text-destructive">{errors.password}</p>}
          </div>

          <div className="space-y-2">
            <Label htmlFor="confirmPassword">Confirm Password *</Label>
            <Input
              id="confirmPassword"
              name="confirmPassword"
              type="password"
              placeholder="••••••••"
              value={formData.confirmPassword}
              onChange={handleChange}
            />
            {errors.confirmPassword && <p className="text-sm text-destructive">{errors.confirmPassword}</p>}
          </div>
        </div>
      )}

      {/* Step 2: Company Information */}
      {step === 2 && (
        <div className="space-y-4">
          <div className="mb-6">
            <h2 className="text-lg font-semibold">Step 2 of 3: Company Information</h2>
            <p className="text-sm text-muted-foreground mt-1">Provide your company details</p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="companyName">Company Name *</Label>
            <Input
              id="companyName"
              name="companyName"
              type="text"
              placeholder="ABC Pharma Distributors"
              value={formData.companyName}
              onChange={handleChange}
            />
            {errors.companyName && <p className="text-sm text-destructive">{errors.companyName}</p>}
          </div>

          <div className="space-y-2">
            <Label htmlFor="licenseNumber">Wholesale License Number *</Label>
            <Input
              id="licenseNumber"
              name="licenseNumber"
              type="text"
              placeholder="WL/DL-2024/12345"
              value={formData.licenseNumber}
              onChange={handleChange}
            />
            {errors.licenseNumber && <p className="text-sm text-destructive">{errors.licenseNumber}</p>}
          </div>

          <div className="space-y-2">
            <Label htmlFor="gstNumber">GST Number *</Label>
            <Input
              id="gstNumber"
              name="gstNumber"
              type="text"
              placeholder="27AAFHU5055K1Z5"
              value={formData.gstNumber}
              onChange={handleChange}
              style={{ textTransform: "uppercase" }}
            />
            <p className="text-xs text-muted-foreground">15-digit GST number (e.g., 27AAFHU5055K1Z5)</p>
            {errors.gstNumber && <p className="text-sm text-destructive">{errors.gstNumber}</p>}
          </div>
        </div>
      )}

      {/* Step 3: Address & Service Areas */}
      {step === 3 && (
        <div className="space-y-4">
          <div className="mb-6">
            <h2 className="text-lg font-semibold">Step 3 of 3: Address & Service Areas</h2>
            <p className="text-sm text-muted-foreground mt-1">Complete your business location details</p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="streetAddress">Street Address *</Label>
            <Input
              id="streetAddress"
              name="streetAddress"
              type="text"
              placeholder="123 Business Street"
              value={formData.streetAddress}
              onChange={handleChange}
            />
            {errors.streetAddress && <p className="text-sm text-destructive">{errors.streetAddress}</p>}
          </div>

          <div className="space-y-2">
            <Label htmlFor="landmark">Landmark (Optional)</Label>
            <Input
              id="landmark"
              name="landmark"
              type="text"
              placeholder="Near City Center"
              value={formData.landmark}
              onChange={handleChange}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="city">City *</Label>
              <Input
                id="city"
                name="city"
                type="text"
                placeholder="Mumbai"
                value={formData.city}
                onChange={handleChange}
              />
              {errors.city && <p className="text-sm text-destructive">{errors.city}</p>}
            </div>

            <div className="space-y-2">
              <Label htmlFor="state">State *</Label>
              <Input
                id="state"
                name="state"
                type="text"
                placeholder="Maharashtra"
                value={formData.state}
                onChange={handleChange}
              />
              {errors.state && <p className="text-sm text-destructive">{errors.state}</p>}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="pincode">Pincode *</Label>
            <Input
              id="pincode"
              name="pincode"
              type="text"
              placeholder="400001"
              value={formData.pincode}
              onChange={handleChange}
              maxLength={6}
            />
            {errors.pincode && <p className="text-sm text-destructive">{errors.pincode}</p>}
          </div>

          <div className="space-y-2">
            <Label htmlFor="serviceAreas">Service Areas *</Label>
            <textarea
              id="serviceAreas"
              name="serviceAreas"
              placeholder="List the cities/regions you serve (e.g., Mumbai, Pune, Nagpur)"
              value={formData.serviceAreas}
              onChange={handleChange}
              className="w-full px-3 py-2 border border-input rounded-md bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              rows={3}
            />
            {errors.serviceAreas && <p className="text-sm text-destructive">{errors.serviceAreas}</p>}
          </div>
        </div>
      )}

      {/* Navigation Buttons */}
      <div className="flex gap-3 pt-6">
        {step > 1 && (
          <Button type="button" variant="outline" onClick={handleBack} className="flex-1">
            Back
          </Button>
        )}

        {step < 3 ? (
          <Button type="button" onClick={handleNext} className="flex-1">
            Next
          </Button>
        ) : (
          <Button type="submit" disabled={isLoading} className="flex-1">
            {isLoading ? "Creating account..." : "Complete Registration"}
          </Button>
        )}
      </div>

      {/* Sign in link */}
      <p className="text-center text-sm text-muted-foreground">
        Already have an account?{" "}
        <Link href="/signin" className="text-primary hover:underline">
          Sign in
        </Link>
      </p>
    </form>
  )
}
