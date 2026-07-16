"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { useRouter } from "next/navigation";

import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { clearLoginPrefs, getLoginPrefs, type SavedLoginPrefs, saveLoginPrefs, useAuth } from "@/lib/idempiere";
import type { AuthOrganization, AuthRole, AuthWarehouse } from "@/lib/idempiere/types";

// ── Step types ──────────────────────────────────────────────

type LoginStep = "credentials" | "session";

// ── Schemas ─────────────────────────────────────────────────

const credentialsSchema = z.object({
  username: z.string().min(1, { message: "Username is required." }),
  password: z.string().min(1, { message: "Password is required." }),
});

type CredentialsValues = z.infer<typeof credentialsSchema>;

export function LoginForm() {
  const router = useRouter();
  const { authenticate, selectSession, fetchRoles, fetchOrganizations, fetchWarehouses, setRemember } = useAuth();

  const [step, setStep] = useState<LoginStep>("credentials");
  const [loading, setLoading] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);

  // Provisional token from step 1
  const [provToken, setProvToken] = useState<string>("");
  const [clients, setClients] = useState<{ id: number; name: string }[]>([]);
  const [selectedClient, setSelectedClient] = useState<number | null>(null);

  // Session selection state
  const [roles, setRoles] = useState<AuthRole[]>([]);
  const [orgs, setOrgs] = useState<AuthOrganization[]>([]);
  const [warehouses, setWarehouses] = useState<AuthWarehouse[]>([]);
  const [selectedRole, setSelectedRole] = useState<number | null>(null);
  const [selectedOrg, setSelectedOrg] = useState<number | null>(null);
  const [selectedWarehouse, setSelectedWarehouse] = useState<number | null>(null);

  // ── Form ──────────────────────────────────────────────────

  const credentialsForm = useForm<CredentialsValues>({
    defaultValues: { username: "", password: "" },
  });

  // ponytail: restore saved login prefs when Remember Me was previously enabled
  const savedPrefsRef = useRef<SavedLoginPrefs | null>(null);
  const [prefsLoaded, setPrefsLoaded] = useState(false);
  useEffect(() => {
    if (prefsLoaded) return;
    const prefs = getLoginPrefs();
    if (!prefs) {
      setPrefsLoaded(true);
      return;
    }
    setRememberMe(true);
    credentialsForm.setValue("username", prefs.username);
    credentialsForm.setValue("password", prefs.password);
    savedPrefsRef.current = prefs;
    setPrefsLoaded(true);
  }, [prefsLoaded, credentialsForm]);

  const onCredentialsSubmit = useCallback(
    async (data: CredentialsValues) => {
      setLoading(true);
      try {
        const result = await authenticate(data.username, data.password);
        setProvToken(result.token);
        setClients(result.clients);

        if (result.clients.length === 0) {
          toast.error("No clients available for this user.");
          return;
        }

        // If only 1 client, auto-select and pre-load roles
        if (result.clients.length === 1) {
          const clientId = result.clients[0].id;
          setSelectedClient(clientId);
          const rolesData = await fetchRoles(clientId, result.token);
          setRoles(rolesData);

          // ponytail: auto-select saved session params if Remember Me
          const prefs = savedPrefsRef.current;
          if (prefs && prefs.clientId === clientId) {
            const role = rolesData.find((r) => r.id === prefs.roleId);
            if (role) {
              setSelectedRole(prefs.roleId);
              const orgsData = await fetchOrganizations(prefs.clientId, prefs.roleId, result.token);
              setOrgs(orgsData);
              const org = orgsData.find((o) => o.id === prefs.organizationId);
              if (org) {
                setSelectedOrg(prefs.organizationId);
                const whData = await fetchWarehouses(prefs.clientId, prefs.roleId, prefs.organizationId, result.token);
                setWarehouses(whData);
                const wh = whData.find((w) => w.id === prefs.warehouseId);
                if (wh) setSelectedWarehouse(prefs.warehouseId);
              }
            }
          }
        }

        setStep("session");
      } catch (err) {
        toast.error("Login failed", {
          description: err instanceof Error ? err.message : "Unknown error",
        });
      } finally {
        setLoading(false);
      }
    },
    [authenticate, fetchRoles, fetchOrganizations, fetchWarehouses],
  );

  // ── Step 2: client selection → load roles ─────────────────

  const onClientSelect = useCallback(
    async (clientId: number) => {
      setSelectedClient(clientId);
      setSelectedRole(null);
      setSelectedOrg(null);
      setSelectedWarehouse(null);
      setRoles([]);
      setOrgs([]);
      setWarehouses([]);

      try {
        const rolesData = await fetchRoles(clientId, provToken);
        setRoles(rolesData);
      } catch (err) {
        toast.error("Failed to load roles", {
          description: err instanceof Error ? err.message : "Unknown error",
        });
      }
    },
    [provToken, fetchRoles],
  );

  // ── Step 2b: role selection → load organizations ──────────

  const onRoleSelect = useCallback(
    async (roleId: number) => {
      setSelectedRole(roleId);
      setSelectedOrg(null);
      setSelectedWarehouse(null);
      setOrgs([]);
      setWarehouses([]);

      if (!selectedClient) return;

      try {
        const orgsData = await fetchOrganizations(selectedClient, roleId, provToken);
        setOrgs(orgsData);
      } catch (err) {
        toast.error("Failed to load organizations", {
          description: err instanceof Error ? err.message : "Unknown error",
        });
      }
    },
    [provToken, selectedClient, fetchOrganizations],
  );

  // ── Step 2c: org selection → load warehouses ──────────────

  const onOrgSelect = useCallback(
    async (orgId: number) => {
      setSelectedOrg(orgId);
      setSelectedWarehouse(null);
      setWarehouses([]);

      if (!selectedClient || !selectedRole) return;

      try {
        const whData = await fetchWarehouses(selectedClient, selectedRole, orgId, provToken);
        setWarehouses(whData);
      } catch (err) {
        toast.error("Failed to load warehouses", {
          description: err instanceof Error ? err.message : "Unknown error",
        });
      }
    },
    [provToken, selectedClient, selectedRole, fetchWarehouses],
  );

  // ── Step 3: finalize login ────────────────────────────────

  const onSessionSubmit = useCallback(async () => {
    if (!selectedClient || !selectedRole || !selectedOrg || !selectedWarehouse) {
      toast.error("Please select all session parameters.");
      return;
    }

    setLoading(true);
    try {
      const clientName = clients.find((c) => c.id === selectedClient)?.name ?? "";
      const roleName = roles.find((r) => r.id === selectedRole)?.name ?? "";
      const orgName = orgs.find((o) => o.id === selectedOrg)?.name ?? "";
      const warehouseName = warehouses.find((w) => w.id === selectedWarehouse)?.name ?? "";
      await selectSession(provToken, {
        clientId: selectedClient,
        roleId: selectedRole,
        organizationId: selectedOrg,
        warehouseId: selectedWarehouse,
        userName: credentialsForm.getValues("username"),
        clientName,
        roleName,
        orgName,
        warehouseName,
      });
      setRemember(rememberMe);
      // ponytail: save or clear login prefs based on Remember Me
      if (rememberMe) {
        saveLoginPrefs({
          username: credentialsForm.getValues("username"),
          password: credentialsForm.getValues("password"),
          clientId: selectedClient,
          roleId: selectedRole,
          organizationId: selectedOrg,
          warehouseId: selectedWarehouse,
        });
      } else {
        clearLoginPrefs();
      }
      toast.success("Login successful");
      router.push("/dashboard");
    } catch (err) {
      toast.error("Session setup failed", {
        description: err instanceof Error ? err.message : "Unknown error",
      });
    } finally {
      setLoading(false);
    }
  }, [
    provToken,
    selectedClient,
    selectedRole,
    selectedOrg,
    selectedWarehouse,
    selectSession,
    router,
    rememberMe,
    credentialsForm,
    setRemember,
    warehouses.find,
    roles.find,
    orgs.find,
    clients.find,
  ]);

  // ── Render: Credentials step ──────────────────────────────

  if (step === "credentials") {
    return (
      <form
        noValidate
        action="#"
        onSubmit={credentialsForm.handleSubmit(onCredentialsSubmit)}
        className="flex flex-col gap-4"
      >
        <FieldGroup className="gap-4">
          <Controller
            control={credentialsForm.control}
            name="username"
            render={({ field, fieldState }) => (
              <Field className="gap-1.5" data-invalid={fieldState.invalid}>
                <FieldLabel htmlFor="login-username">Username</FieldLabel>
                <Input
                  {...field}
                  id="login-username"
                  type="text"
                  placeholder="GardenAdmin"
                  autoComplete="username"
                  aria-invalid={fieldState.invalid}
                />
                {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
              </Field>
            )}
          />
          <Controller
            control={credentialsForm.control}
            name="password"
            render={({ field, fieldState }) => (
              <Field className="gap-1.5" data-invalid={fieldState.invalid}>
                <FieldLabel htmlFor="login-password">Password</FieldLabel>
                <Input
                  {...field}
                  id="login-password"
                  type="password"
                  placeholder="••••••••"
                  autoComplete="current-password"
                  aria-invalid={fieldState.invalid}
                />
                {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
              </Field>
            )}
          />
        </FieldGroup>
        <div className="flex items-center gap-2">
          <input
            id="remember-me"
            type="checkbox"
            checked={rememberMe}
            onChange={(e) => setRememberMe(e.target.checked)}
            className="size-4 cursor-pointer rounded border-input accent-primary"
          />
          <label htmlFor="remember-me" className="cursor-pointer select-none text-sm">
            Remember me
          </label>
        </div>
        <Button className="w-full" type="submit" disabled={loading}>
          {loading ? "Authenticating..." : "Login"}
        </Button>
      </form>
    );
  }

  // ── Render: Session selection step ────────────────────────

  return (
    <div className="flex flex-col gap-4">
      <div className="space-y-1 text-center">
        <h2 className="font-medium text-lg">Select Session</h2>
        <p className="text-muted-foreground text-sm">Choose your working context to continue.</p>
      </div>

      <FieldGroup className="gap-4">
        {/* Client */}
        <Field className="gap-1.5">
          <FieldLabel>Client / Tenant</FieldLabel>
          <Select value={selectedClient?.toString() ?? ""} onValueChange={(v) => onClientSelect(Number(v))}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Select client" />
            </SelectTrigger>
            <SelectContent>
              {clients.map((c) => (
                <SelectItem key={c.id} value={c.id.toString()}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>

        {/* Role */}
        <Field className="gap-1.5">
          <FieldLabel>Role</FieldLabel>
          <Select
            value={selectedRole?.toString() ?? ""}
            onValueChange={(v) => onRoleSelect(Number(v))}
            disabled={roles.length === 0}
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Select role" />
            </SelectTrigger>
            <SelectContent>
              {roles.map((r) => (
                <SelectItem key={r.id} value={r.id.toString()}>
                  {r.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>

        {/* Organization */}
        <Field className="gap-1.5">
          <FieldLabel>Organization</FieldLabel>
          <Select
            value={selectedOrg?.toString() ?? ""}
            onValueChange={(v) => onOrgSelect(Number(v))}
            disabled={orgs.length === 0}
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Select organization" />
            </SelectTrigger>
            <SelectContent>
              {orgs.map((o) => (
                <SelectItem key={o.id} value={o.id.toString()}>
                  {o.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>

        {/* Warehouse */}
        <Field className="gap-1.5">
          <FieldLabel>Warehouse</FieldLabel>
          <Select
            value={selectedWarehouse?.toString() ?? ""}
            onValueChange={(v) => setSelectedWarehouse(Number(v))}
            disabled={warehouses.length === 0}
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Select warehouse" />
            </SelectTrigger>
            <SelectContent>
              {warehouses.map((w) => (
                <SelectItem key={w.id} value={w.id.toString()}>
                  {w.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      </FieldGroup>

      <div className="flex gap-2">
        <Button
          variant="outline"
          className="flex-1"
          onClick={() => {
            setStep("credentials");
            setSelectedClient(null);
            setSelectedRole(null);
            setSelectedOrg(null);
            setSelectedWarehouse(null);
          }}
        >
          Back
        </Button>
        <Button
          className="flex-1"
          onClick={onSessionSubmit}
          disabled={loading || !selectedClient || !selectedRole || !selectedOrg || !selectedWarehouse}
        >
          {loading ? "Connecting..." : "Continue"}
        </Button>
      </div>
    </div>
  );
}
