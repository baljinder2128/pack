import { router } from 'expo-router';
import { useState } from 'react';

import { Badge, Button, Card, ErrorText, Field, Loading, Muted, Row, Screen, Segmented, Title, colors } from '@/components/ui';
import { callFunction, listDrivers } from '@/lib/drivers';
import { money } from '@/lib/pay';
import { useFocusQuery } from '@/lib/useQuery';

function tempPassword(): string {
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  let out = '';
  for (let i = 0; i < 10; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

export default function DriversScreen() {
  const { data, loading, error, reload } = useFocusQuery(() => listDrivers({ includeRemoved: true }), []);
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState(tempPassword);
  const [role, setRole] = useState<'driver' | 'office'>('driver');
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [created, setCreated] = useState<string | null>(null);

  async function create() {
    setBusy(true);
    setFormError(null);
    try {
      await callFunction('manage-driver', { action: 'create', full_name: name, email, phone, password, role });
      setCreated(`Login created. Give ${name} these details:\nEmail: ${email.trim().toLowerCase()}\nPassword: ${password}`);
      setName('');
      setEmail('');
      setPhone('');
      setPassword(tempPassword());
      setAdding(false);
      reload();
    } catch (e) {
      setFormError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  const active = (data ?? []).filter((d) => d.active);
  const removed = (data ?? []).filter((d) => !d.active);

  return (
    <Screen>
      {created && (
        <Card>
          <Title>Done</Title>
          <Muted>{created}</Muted>
        </Card>
      )}
      {adding ? (
        <Card>
          <Title>New login</Title>
          <Segmented
            value={role}
            onChange={setRole}
            options={[
              { value: 'driver', label: 'Driver' },
              { value: 'office', label: 'Office' },
            ]}
          />
          <Field label="Full name" value={name} onChangeText={setName} autoCapitalize="words" />
          <Field label="Email (their username)" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" />
          <Field label="Phone" value={phone} onChangeText={setPhone} keyboardType="phone-pad" />
          <Field label="Temporary password" value={password} onChangeText={setPassword} autoCapitalize="none" />
          <ErrorText>{formError}</ErrorText>
          <Button title="Create login" onPress={create} busy={busy} />
          <Button title="Cancel" variant="secondary" onPress={() => setAdding(false)} />
        </Card>
      ) : (
        <Button
          title="+ Add driver or office login"
          onPress={() => {
            setCreated(null);
            setAdding(true);
          }}
        />
      )}
      <ErrorText>{error}</ErrorText>
      {loading && !data && <Loading />}
      {active.map((d) => (
        <Card key={d.id} onPress={() => router.push(`/driver/${d.id}`)}>
          <Row>
            <Title>{d.full_name || 'Unnamed'}</Title>
            {d.role === 'office' && <Badge label="Office" color={colors.primary} />}
          </Row>
          <Muted>
            {d.email}
            {d.hourly_rate ? ` · ${money(d.hourly_rate)}/hr` : ''}
          </Muted>
        </Card>
      ))}
      {removed.length > 0 && <Title>Removed</Title>}
      {removed.map((d) => (
        <Card key={d.id} onPress={() => router.push(`/driver/${d.id}`)}>
          <Row>
            <Title>{d.full_name || 'Unnamed'}</Title>
            <Badge label="Removed" color={colors.danger} />
          </Row>
          <Muted>{d.email}</Muted>
        </Card>
      ))}
    </Screen>
  );
}
