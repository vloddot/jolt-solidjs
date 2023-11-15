import './index.scss';
import styles from '@lib/util.module.scss';
import { Index, Show, createSignal, useContext } from 'solid-js';
import util from '@lib/util';
import detect from 'browser-detect';
import { useNavigate } from '@solidjs/router';
import { createStore } from 'solid-js/store';
import { SessionContext } from '@lib/context/session';

const displayMethods: Record<MFAMethod, string> = {
	Totp: 'TOTP Code',
	Recovery: 'Recovery Code',
	Password: 'Password'
};

function getFriendlyName(): string {
	const { mobile, os, name } = detect();

	let platform: string;
	if ('__TAURI__' in window && os != undefined) {
		platform = os.charAt(0).toUpperCase() + os.slice(1);
	} else if (name != undefined) {
		platform = name.charAt(0).toUpperCase() + name.slice(1);
	} else {
		platform = 'Unknown Platform';
	}

	return `Jolt ${mobile ? 'Mobile' : 'Desktop'} on ${platform}`;
}

function Login() {
	const [, setSession] = useContext(SessionContext);

	const navigate = useNavigate();

	let emailInput: HTMLInputElement;
	let passwordInput: HTMLInputElement;

	const [error, setError] = createSignal<string | undefined>();
	const [rememberMe, setRememberMe] = createSignal(true);
	const [mfaMethods, setMfaMethods] = createStore<Partial<Record<MFAMethod, string>>>({
		Totp: '',
		Recovery: ''
	});

	async function login(event: Event) {
		event.preventDefault();

		const email = emailInput.value.trim();
		const password = passwordInput.value.trim();

		if (email == '' || password == '') {
			setError('Email and password fields are required.');
			return;
		}
		const friendly_name = getFriendlyName();
		const credentialLoginResponse = await util.login({
			email,
			password,
			friendly_name
		});

		if ('type' in credentialLoginResponse) {
			switch (credentialLoginResponse.type) {
				case 'UnverifiedAccount':
					setError('Your account is not verified. Check your email.');
					break;
				case 'LockedOut':
					setError('You have been locked out of your account due to too many logins.');
					break;
				case 'InvalidToken':
					setError('Invalid MFA ticket or token.');
					break;
				case 'InvalidCredentials':
					setError('Invalid credentials');
					break;
			}

			return;
		}

		if (credentialLoginResponse.result == 'MFA') {
			let mfa_response: MFAResponse | undefined = undefined;
			if (mfaMethods.Totp) {
				mfa_response = { totp_code: mfaMethods.Totp };
			} else if (mfaMethods.Recovery) {
				mfa_response = { recovery_code: mfaMethods.Recovery };
			} else if (mfaMethods.Password) {
				mfa_response = { password: mfaMethods.Password };
			}

			if (mfa_response == undefined) {
				setError('MFA is required for this account.');
			}

			const mfaLoginResponse = await util
				.login({
					mfa_ticket: credentialLoginResponse.ticket,
					mfa_response,
					friendly_name
				})
				.catch((error) => {
					setError(error);
				});

			if (mfaLoginResponse == undefined) {
				return;
			}

			if (mfaLoginResponse.result == 'MFA') {
				setMfaMethods(
					Object.fromEntries(mfaLoginResponse.allowed_methods.map((method) => [method, '']))
				);
				setError('Invalid MFA code.');
				return;
			}

			handleLoginResponse(mfaLoginResponse);
			return;
		}

		handleLoginResponse(credentialLoginResponse);
	}

	async function handleLoginResponse(response: Exclude<ResponseLogin, { result: 'MFA' }>) {
		if (response.result == 'Disabled') {
			setError(`Account ${response.user_id} is disabled`);
			return;
		}

		if (rememberMe()) {
			localStorage.setItem('session', JSON.stringify(response));
		}

		setSession(response);
		navigate('/');
	}

	return (
		<div class={styles.modalContainer}>
			<form id="login-form" class={styles.modalBase} onSubmit={login}>
				<h1>Jolt &#x26A1;</h1>

				<p>
					The Revolt client inspired by the revolt.chat client re-taped from the one that's held
					together by duct tape and bad code
				</p>

				<input type="email" placeholder="Email" ref={emailInput!} />
				<input type="password" placeholder="Password" ref={passwordInput!} />

				<p>
					Optionally, if your account uses MFA, use one of these methods, including the previous
					email and password as well
				</p>

				<Index each={Object.entries(mfaMethods)}>
					{(method) => {
						const [key] = method();
						return (
							<input
								type="text"
								placeholder={`${displayMethods[key as MFAMethod]} (Optional)`}
								onInput={(event) => setMfaMethods(key as MFAMethod, event.currentTarget.value)}
							/>
						);
					}}
				</Index>

				<label>
					Remember me
					<input
						type="checkbox"
						checked={rememberMe()}
						onInput={(event) => setRememberMe(event.currentTarget.checked)}
					/>
				</label>

				<button class={styles.buttonPrimary} type="submit">
					Login
				</button>

				<Show when={error() != undefined}>
					<p>{error()}</p>
				</Show>
			</form>
		</div>
	);
}

export default Login;
