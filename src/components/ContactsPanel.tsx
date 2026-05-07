import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import { toast } from "sonner";

export default function ContactsPanel() {
  const contacts = useQuery(api.contacts.getContacts) ?? [];
  const addContact = useMutation(api.contacts.addContact);
  const toggleBlock = useMutation(api.contacts.toggleBlockContact);
  const deleteContact = useMutation(api.contacts.deleteContact);

  const [showForm, setShowForm] = useState(false);
  const [phone, setPhone] = useState("");
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");

  const handleAdd = async () => {
    if (!phone.trim() || !name.trim()) {
      toast.error("Enter phone number and name");
      return;
    }
    setLoading(true);
    try {
      const result = await addContact({ phoneNumber: phone, displayName: name });
      toast.success(result.updated ? "Contact updated!" : "Contact added!");
      setPhone(""); setName(""); setShowForm(false);
    } catch {
      toast.error("Failed to add contact");
    } finally {
      setLoading(false);
    }
  };

  const filtered = contacts.filter(
    (c) =>
      c.displayName.toLowerCase().includes(search.toLowerCase()) ||
      c.phoneNumber.includes(search)
  );

  const active = filtered.filter((c) => !c.isBlocked);
  const blocked = filtered.filter((c) => c.isBlocked);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-white">Contacts</h2>
        <button
          onClick={() => setShowForm(!showForm)}
          className="bg-green-600 hover:bg-green-500 text-white text-sm font-semibold px-4 py-2 rounded-xl transition-colors"
        >
          {showForm ? "Cancel" : "+ Add"}
        </button>
      </div>

      {showForm && (
        <div className="bg-gray-900 border border-green-500/30 rounded-xl p-4 space-y-3">
          <h3 className="text-white font-semibold text-sm">Add Contact</h3>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Display name"
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-green-500"
          />
          <input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="+91 98765 43210"
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-green-500"
          />
          <button
            onClick={handleAdd}
            disabled={loading}
            className="w-full bg-green-600 hover:bg-green-500 disabled:opacity-50 text-white font-semibold py-2.5 rounded-lg transition-colors text-sm"
          >
            {loading ? "Adding..." : "Add Contact"}
          </button>
        </div>
      )}

      {/* Search */}
      {contacts.length > 0 && (
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search contacts..."
          className="w-full bg-gray-900 border border-gray-800 rounded-xl px-4 py-2.5 text-white text-sm focus:outline-none focus:border-green-500"
        />
      )}

      {contacts.length === 0 ? (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-8 text-center">
          <div className="text-4xl mb-3">👥</div>
          <p className="text-gray-400">No contacts yet.</p>
          <p className="text-gray-600 text-sm mt-1">Add contacts manually or they'll sync from WhatsApp.</p>
        </div>
      ) : (
        <>
          {active.length > 0 && (
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
              <h3 className="text-white font-semibold mb-3 text-sm">Contacts ({active.length})</h3>
              <div className="space-y-2">
                {active.map((c) => (
                  <div key={c._id} className="flex items-center gap-3 bg-gray-800 rounded-lg p-3">
                    <div className="w-9 h-9 bg-green-500/20 rounded-full flex items-center justify-center flex-shrink-0">
                      <span className="text-green-400 font-bold text-sm">
                        {c.displayName[0]?.toUpperCase()}
                      </span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-white text-sm font-medium truncate">{c.displayName}</p>
                      <p className="text-gray-500 text-xs">{c.phoneNumber}</p>
                    </div>
                    <div className="flex gap-1">
                      <button
                        onClick={() => toggleBlock({ contactId: c._id })}
                        className="text-xs px-2 py-1 rounded bg-yellow-500/20 text-yellow-400 hover:bg-yellow-500/30 transition-colors"
                      >
                        Block
                      </button>
                      <button
                        onClick={() => deleteContact({ contactId: c._id })}
                        className="text-xs px-2 py-1 rounded bg-red-500/20 text-red-400 hover:bg-red-500/30 transition-colors"
                      >
                        Del
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {blocked.length > 0 && (
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
              <h3 className="text-white font-semibold mb-3 text-sm text-red-400">Blocked ({blocked.length})</h3>
              <div className="space-y-2">
                {blocked.map((c) => (
                  <div key={c._id} className="flex items-center gap-3 bg-gray-800/50 rounded-lg p-3 opacity-60">
                    <div className="w-9 h-9 bg-red-500/20 rounded-full flex items-center justify-center flex-shrink-0">
                      <span className="text-red-400 font-bold text-sm">
                        {c.displayName[0]?.toUpperCase()}
                      </span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-gray-400 text-sm font-medium truncate">{c.displayName}</p>
                      <p className="text-gray-600 text-xs">{c.phoneNumber}</p>
                    </div>
                    <button
                      onClick={() => toggleBlock({ contactId: c._id })}
                      className="text-xs px-2 py-1 rounded bg-green-500/20 text-green-400 hover:bg-green-500/30 transition-colors"
                    >
                      Unblock
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
