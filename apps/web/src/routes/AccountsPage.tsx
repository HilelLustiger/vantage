import { useEffect, useState, type FormEvent } from "react";
import { Plus } from "lucide-react";
import type { Account, Institution } from "@vantage/shared-types";
import { Badge } from "../components/Badge";
import { Button } from "../components/Button";
import { Card } from "../components/Card";
import { Combobox, type ComboboxSelection } from "../components/Combobox";
import { Modal } from "../components/Modal";
import { Table, TableBody, TableCell, TableHead, TableHeaderCell } from "../components/Table";
import { useAuth } from "../lib/AuthContext";
import { accountsApi } from "../lib/api/accounts";
import { institutionsApi } from "../lib/api/institutions";
import { usersApi } from "../lib/api/users";

type HouseholdUser = { id: string; email: string };

export function AccountsPage() {
  const { user } = useAuth();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [institutions, setInstitutions] = useState<Institution[]>([]);
  const [users, setUsers] = useState<HouseholdUser[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);

  async function refresh() {
    const [accountList, institutionList, userList] = await Promise.all([
      accountsApi.list(),
      institutionsApi.list(),
      usersApi.list(),
    ]);
    setAccounts(accountList);
    setInstitutions(institutionList);
    setUsers(userList);
  }

  useEffect(() => {
    refresh().finally(() => setIsLoading(false));
  }, []);

  function institutionName(institutionId: string) {
    return institutions.find((i) => i.id === institutionId)?.name ?? "Unknown institution";
  }

  function ownerEmails(ownerUserIds: string[]) {
    return ownerUserIds.map((id) => users.find((u) => u.id === id)?.email ?? id);
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-lg font-semibold text-gray-900">Accounts</h1>
        <Button onClick={() => setIsModalOpen(true)}>
          <Plus size={16} className="mr-1" />
          Add account
        </Button>
      </div>

      <Card className="p-0">
        <Table>
          <TableHead>
            <tr>
              <TableHeaderCell>Name</TableHeaderCell>
              <TableHeaderCell>Institution</TableHeaderCell>
              <TableHeaderCell>Owners</TableHeaderCell>
            </tr>
          </TableHead>
          <TableBody>
            {accounts.map((account) => (
              <tr key={account.id}>
                <TableCell className="font-medium text-gray-900">{account.name}</TableCell>
                <TableCell>{institutionName(account.institutionId)}</TableCell>
                <TableCell>
                  <div className="flex flex-wrap gap-1">
                    {ownerEmails(account.ownerUserIds).map((email) => (
                      <Badge key={email}>{email}</Badge>
                    ))}
                  </div>
                </TableCell>
              </tr>
            ))}
          </TableBody>
        </Table>
        {!isLoading && accounts.length === 0 && (
          <p className="px-4 py-8 text-center text-sm text-gray-500">No accounts yet.</p>
        )}
      </Card>

      {isModalOpen && user && (
        <AddAccountModal
          institutions={institutions}
          users={users}
          currentUserId={user.id}
          onClose={() => setIsModalOpen(false)}
          onCreated={async () => {
            setIsModalOpen(false);
            await refresh();
          }}
        />
      )}
    </div>
  );
}

function AddAccountModal({
  institutions,
  users,
  currentUserId,
  onClose,
  onCreated,
}: {
  institutions: Institution[];
  users: HouseholdUser[];
  currentUserId: string;
  onClose: () => void;
  onCreated: () => void | Promise<void>;
}) {
  const [name, setName] = useState("");
  const [institution, setInstitution] = useState<ComboboxSelection | null>(null);
  const [ownerIds, setOwnerIds] = useState<Set<string>>(new Set([currentUserId]));
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  function toggleOwner(id: string) {
    if (id === currentUserId) return; // creator is always an owner
    setOwnerIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!institution || !institution.label) {
      setError("Choose or create an institution");
      return;
    }
    setIsSubmitting(true);
    try {
      const institutionId =
        institution.id ?? (await institutionsApi.create({ name: institution.label })).id;
      await accountsApi.create({
        institutionId,
        name,
        ownerUserIds: [...ownerIds],
      });
      await onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Modal title="Add account" onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700" htmlFor="account-name">
            Name
          </label>
          <input
            id="account-name"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none"
          />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">Institution</label>
          <Combobox
            options={institutions.map((i) => ({ id: i.id, label: i.name }))}
            value={institution}
            onChange={setInstitution}
            placeholder="Search or create an institution"
          />
        </div>

        {users.length > 1 && (
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Owners</label>
            <div className="space-y-1">
              {users.map((u) => (
                <label key={u.id} className="flex items-center gap-2 text-sm text-gray-700">
                  <input
                    type="checkbox"
                    checked={ownerIds.has(u.id)}
                    onChange={() => toggleOwner(u.id)}
                    disabled={u.id === currentUserId}
                    className="rounded border-gray-300 text-emerald-600 focus:ring-emerald-500"
                  />
                  {u.email}
                  {u.id === currentUserId && <span className="text-gray-400"> (you)</span>}
                </label>
              ))}
            </div>
          </div>
        )}

        {error && <p className="text-sm text-red-600">{error}</p>}

        <Button type="submit" disabled={isSubmitting} className="w-full">
          {isSubmitting ? "Creating..." : "Create account"}
        </Button>
      </form>
    </Modal>
  );
}
