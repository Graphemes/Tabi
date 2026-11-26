"use client";

import { useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Loader2, MapPin, Receipt, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuthStore } from "@/store/auth-store";
import { requestOtp, verifyOtp } from "@/features/whatsapp/api";

const loginSchema = z.object({
  mobile: z
    .string()
    .min(10, "Enter valid mobile number")
    .regex(/^\d{10}$/, "Enter a valid 10-digit mobile number"),
});

type LoginSchema = z.infer<typeof loginSchema>;

const HIGHLIGHTS = [
  { icon: Users, title: "Plan together", body: "One place for the whole group." },
  { icon: Receipt, title: "Split fairly", body: "Six ways to divide any expense." },
  { icon: MapPin, title: "Stay found", body: "Live location while you travel." },
];

export function LoginScreen() {
  const queryClient = useQueryClient();
  const setAuth = useAuthStore((s) => s.setAuth);
  const [step, setStep] = useState<"phone" | "otp">("phone");
  const [pendingPhone, setPendingPhone] = useState("");
  const [otpValue, setOtpValue] = useState("");

  const form = useForm<LoginSchema>({
    resolver: zodResolver(loginSchema),
    defaultValues: { mobile: "" },
  });
  // `useWatch` rather than `form.watch()`: the React Compiler can't memoise around
  // `watch` and skips optimising the whole component.
  const mobile = useWatch({ control: form.control, name: "mobile" });

  const requestOtpMutation = useMutation({
    mutationFn: (phone: string) => requestOtp(phone),
    onSuccess: () => setStep("otp"),
  });

  const verifyOtpMutation = useMutation({
    mutationFn: verifyOtp,
    onSuccess: (data) => {
      setAuth({
        accessToken: data.access_token,
        refreshToken: data.refresh_token,
        user: { ...data.user, phone: data.phone, name: data.user.name || "User" },
      });
      queryClient.invalidateQueries({ queryKey: ["profile"] });
    },
  });

  return (
    <div className="flex min-h-0 flex-1 overflow-y-auto bg-surface">
      {/* Brand panel — desktop only; the phone layout stays focused on the form. */}
      <div className="relative hidden w-1/2 flex-col justify-between overflow-hidden bg-brand-900 p-12 lg:flex">
        <div
          aria-hidden
          className="absolute -top-24 -right-24 size-96 rounded-full bg-accent-500/20 blur-3xl"
        />
        <div
          aria-hidden
          className="absolute -bottom-32 -left-16 size-96 rounded-full bg-brand-500/20 blur-3xl"
        />
        <div className="relative flex items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-xl bg-brand-50 text-base font-bold text-brand-900">
            T
          </div>
          <span className="font-heading text-xl font-semibold tracking-tight text-brand-50">
            Tabi
          </span>
        </div>

        <div className="relative space-y-8">
          <h2 className="max-w-[16ch] font-heading text-4xl leading-tight font-semibold text-brand-50">
            Trips with friends, settled fairly.
          </h2>
          <ul className="space-y-5">
            {HIGHLIGHTS.map(({ icon: Icon, title, body }) => (
              <li key={title} className="flex items-start gap-3.5">
                <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg bg-brand-50/10 text-brand-100 ring-1 ring-brand-50/15">
                  <Icon className="size-4.5" />
                </span>
                <span>
                  <span className="block text-sm font-semibold text-brand-50">{title}</span>
                  <span className="block text-sm text-brand-200">{body}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
        <p className="relative text-xs text-brand-300">Built for people who travel together.</p>
      </div>

      <div className="flex flex-1 items-center justify-center p-6">
        <div className="w-full max-w-sm">
          <div className="mb-8 flex items-center gap-2.5 lg:hidden">
            <div className="flex size-10 items-center justify-center rounded-xl bg-brand-900 text-base font-bold text-brand-50">
              T
            </div>
            <span className="font-heading text-xl font-semibold tracking-tight">Tabi</span>
          </div>

          {step === "otp" ? (
            <div className="space-y-6">
              <div className="space-y-2">
                <button
                  type="button"
                  onClick={() => {
                    setStep("phone");
                    setOtpValue("");
                    requestOtpMutation.reset();
                  }}
                  className="-ml-1 inline-flex items-center gap-1.5 rounded-lg px-1 py-1 text-sm text-muted-foreground transition hover:text-foreground"
                >
                  <ArrowLeft className="size-4" />
                  Back
                </button>
                <h1 className="font-heading text-2xl font-semibold tracking-tight">
                  Enter your code
                </h1>
                <p className="text-sm text-muted-foreground">
                  We sent a 6-digit code to{" "}
                  <span className="font-medium text-foreground">{pendingPhone}</span>
                </p>
              </div>

              <div className="space-y-4">
                <Input
                  placeholder="000000"
                  value={otpValue}
                  onChange={(e) => setOtpValue(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  maxLength={6}
                  inputMode="numeric"
                  autoFocus
                  className="tabular h-14 text-center text-2xl tracking-[0.4em]"
                />
                {verifyOtpMutation.isError && (
                  <p className="text-sm text-destructive">Invalid or expired code.</p>
                )}
                <Button
                  size="lg"
                  className="h-11 w-full"
                  disabled={otpValue.length < 4 || verifyOtpMutation.isPending}
                  onClick={() => verifyOtpMutation.mutate({ phone: pendingPhone, otp: otpValue })}
                >
                  {verifyOtpMutation.isPending && <Loader2 className="size-4 animate-spin" />}
                  Verify and continue
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-6">
              <div className="space-y-2">
                <h1 className="font-heading text-2xl font-semibold tracking-tight">
                  Welcome back
                </h1>
                <p className="text-sm text-muted-foreground">
                  Enter your mobile number and we&apos;ll text you a one-time code.
                </p>
              </div>

              <form
                className="space-y-4"
                onSubmit={form.handleSubmit((values) => {
                  const fullPhone = `+91${values.mobile}`;
                  setPendingPhone(fullPhone);
                  requestOtpMutation.mutate(fullPhone);
                })}
              >
                <div className="space-y-1.5">
                  <label htmlFor="mobile" className="text-sm font-medium">
                    Mobile number
                  </label>
                  <div className="relative">
                    <span className="absolute top-1/2 left-3.5 -translate-y-1/2 text-sm font-medium text-muted-foreground">
                      +91
                    </span>
                    <Input
                      id="mobile"
                      placeholder="98765 43210"
                      inputMode="numeric"
                      className="tabular h-11 pl-13"
                      value={mobile}
                      onChange={(e) => {
                        const val = e.target.value.replace(/\D/g, "").slice(0, 10);
                        form.setValue("mobile", val, { shouldValidate: true });
                      }}
                    />
                  </div>
                  {form.formState.errors.mobile && (
                    <p className="text-xs text-destructive">
                      {form.formState.errors.mobile.message}
                    </p>
                  )}
                </div>

                {requestOtpMutation.isError && (
                  <p className="text-sm text-destructive">
                    Couldn&apos;t send the code. If you just requested one, wait a moment
                    before trying again.
                  </p>
                )}

                <Button
                  type="submit"
                  size="lg"
                  className="h-11 w-full"
                  disabled={requestOtpMutation.isPending}
                >
                  {requestOtpMutation.isPending && <Loader2 className="size-4 animate-spin" />}
                  Send code
                </Button>
              </form>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
