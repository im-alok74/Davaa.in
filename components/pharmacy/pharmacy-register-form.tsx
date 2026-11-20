"use client"

import type React from "react"

import { useRef, useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { useToast } from "@/hooks/use-toast"
import { Checkbox } from "@/components/ui/checkbox"

export function PharmacyRegisterForm() {
  const [formData, setFormData] = useState({
    email: "",
    password: "",
    fullName: "",
    phone: "",
    pharmacyName: "",
    licenseNumber: "",
    gstNumber: "",
    address: "",
    city: "",
    state: "",
    pincode: "",
    is24x7: false,
  })
  const [isLoading, setIsLoading] = useState(false)
  // The account is created before the profile. If the profile step fails (e.g. a duplicate
  // licence number) the user is already signed in, so a retry must not sign up again.
  const accountCreated = useRef(false)
  const router = useRouter()
  const { toast } = useToast()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)

    try {
      // First, create user account
      const userResponse = accountCreated.current
        ? { ok: true as const }
        : await fetch("/api/auth/signup", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              email: formData.email,
              password: formData.password,
              fullName: formData.fullName,
              phone: formData.phone,
              userType: "pharmacy",
            }),
          })

      const userData: { error?: string } = "json" in userResponse ? await userResponse.json() : {}

      if (userResponse.ok) {
        accountCreated.current = true
        // Then create pharmacy profile
        const profileResponse = await fetch("/api/pharmacy/profile", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            pharmacyName: formData.pharmacyName,
            licenseNumber: formData.licenseNumber,
            gstNumber: formData.gstNumber,
            address: formData.address,
            city: formData.city,
            state: formData.state,
            pincode: formData.pincode,
            is24x7: formData.is24x7,
          }),
        })

        if (profileResponse.ok) {
          toast({
            title: "Success",
            description: "Registration successful! Your application is under review.",
          })
          router.push("/pharmacy/dashboard")
          router.refresh()
        } else {
          const profileError = await profileResponse.json().catch(() => ({}))
          toast({
            title: "Error",
            description: profileError.error || "Failed to create pharmacy profile",
            variant: "destructive",
          })
        }
      } else {
        toast({
          title: "Error",
          description: userData.error || "Failed to create account",
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
      <div className="space-y-4">
        <h3 className="font-semibold text-foreground">Account Information</h3>
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="fullName">Contact Person Name</Label>
            <Input
              id="fullName"
              type="text"
              value={formData.fullName}
              onChange={(e) => setFormData({ ...formData, fullName: e.target.value })}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="phone">Phone Number</Label>
            <Input
              id="phone"
              type="tel"
              value={formData.phone}
              onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
              required
            />
          </div>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              value={formData.password}
              onChange={(e) => setFormData({ ...formData, password: e.target.value })}
              required
              minLength={6}
            />
          </div>
        </div>
      </div>

      <div className="space-y-4">
        <h3 className="font-semibold text-foreground">Pharmacy Details</h3>
        <div className="space-y-2">
          <Label htmlFor="pharmacyName">Pharmacy Name</Label>
          <Input
            id="pharmacyName"
            type="text"
            value={formData.pharmacyName}
            onChange={(e) => setFormData({ ...formData, pharmacyName: e.target.value })}
            required
          />
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="licenseNumber">License Number</Label>
            <Input
              id="licenseNumber"
              type="text"
              value={formData.licenseNumber}
              onChange={(e) => setFormData({ ...formData, licenseNumber: e.target.value })}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="gstNumber">GST Number (Optional)</Label>
            <Input
              id="gstNumber"
              type="text"
              value={formData.gstNumber}
              onChange={(e) => setFormData({ ...formData, gstNumber: e.target.value })}
            />
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor="address">Address</Label>
          <Textarea
            id="address"
            value={formData.address}
            onChange={(e) => setFormData({ ...formData, address: e.target.value })}
            required
          />
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          <div className="space-y-2">
            <Label htmlFor="city">City</Label>
            <Input
              id="city"
              type="text"
              value={formData.city}
              onChange={(e) => setFormData({ ...formData, city: e.target.value })}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="state">State</Label>
            <Input
              id="state"
              type="text"
              value={formData.state}
              onChange={(e) => setFormData({ ...formData, state: e.target.value })}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="pincode">Pincode</Label>
            <Input
              id="pincode"
              type="text"
              value={formData.pincode}
              onChange={(e) => setFormData({ ...formData, pincode: e.target.value })}
              required
            />
          </div>
        </div>
        <div className="flex items-center space-x-2">
          <Checkbox
            id="is24x7"
            checked={formData.is24x7}
            onCheckedChange={(checked) => setFormData({ ...formData, is24x7: checked as boolean })}
          />
          <Label htmlFor="is24x7" className="cursor-pointer">
            Open 24x7
          </Label>
        </div>
      </div>

      <Button type="submit" className="w-full" disabled={isLoading}>
        {isLoading ? "Registering..." : "Register Pharmacy"}
      </Button>

      <p className="text-center text-sm text-muted-foreground">
        Already have an account?{" "}
        <Link href="/signin" className="text-primary hover:underline">
          Sign in
        </Link>
      </p>
    </form>
  )
}
