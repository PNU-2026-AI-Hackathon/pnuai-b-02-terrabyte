package com.terrabyte.backend.auth;

import java.util.Locale;

import com.terrabyte.backend.api.ApiException;
import com.terrabyte.backend.device.DeviceRepository;
import com.terrabyte.backend.device.DeviceResponse;
import com.terrabyte.backend.space.CultivationSpaceRepository;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.http.HttpStatus;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;

@Service
public class AuthService {

    private final UserAccountRepository userRepository;
    private final PasswordEncoder passwordEncoder;
    private final TokenService tokenService;
    private final DeviceRepository deviceRepository;
    private final CultivationSpaceRepository spaceRepository;

    public AuthService(
            UserAccountRepository userRepository,
            PasswordEncoder passwordEncoder,
            TokenService tokenService,
            DeviceRepository deviceRepository,
            CultivationSpaceRepository spaceRepository) {
        this.userRepository = userRepository;
        this.passwordEncoder = passwordEncoder;
        this.tokenService = tokenService;
        this.deviceRepository = deviceRepository;
        this.spaceRepository = spaceRepository;
    }

    public AuthResponse signup(SignupRequest request) {
        String email = normalizeEmail(request.email());
        if (userRepository.existsByEmail(email)) {
            throw emailAlreadyExists();
        }

        UserAccount user;
        try {
            user = userRepository.save(
                    email,
                    passwordEncoder.encode(request.password()),
                    request.nickname().trim());
        } catch (DuplicateKeyException exception) {
            throw emailAlreadyExists();
        }
        return createAuthResponse(user);
    }

    public AuthResponse login(LoginRequest request) {
        UserAccount user = userRepository.findByEmail(normalizeEmail(request.email()))
                .orElseThrow(this::invalidCredentials);
        if (!passwordEncoder.matches(request.password(), user.passwordHash())) {
            throw invalidCredentials();
        }
        return createAuthResponse(user);
    }

    public MeResponse getMe(long userId) {
        UserAccount user = userRepository.findById(userId)
                .orElseThrow(() -> new ApiException(
                        HttpStatus.NOT_FOUND,
                        "USER_NOT_FOUND",
                        "사용자를 찾을 수 없습니다."));
        var foundDevice = deviceRepository.findByUserId(userId);
        DeviceResponse device = foundDevice
                .map(value -> DeviceResponse.from(
                        value,
                        spaceRepository.findByUserId(userId).orElse(null)))
                .orElse(null);
        boolean hasCrop = foundDevice.map(value -> value.cropCode() != null).orElse(false);
        return new MeResponse(UserResponse.from(user), device != null, hasCrop, device);
    }

    private AuthResponse createAuthResponse(UserAccount user) {
        TokenService.IssuedToken token = tokenService.issue(user);
        return new AuthResponse(
                token.value(),
                "Bearer",
                token.expiresIn(),
                UserResponse.from(user));
    }

    private String normalizeEmail(String email) {
        return email.trim().toLowerCase(Locale.ROOT);
    }

    private ApiException emailAlreadyExists() {
        return new ApiException(
                HttpStatus.CONFLICT,
                "EMAIL_ALREADY_EXISTS",
                "이미 가입된 이메일입니다.");
    }

    private ApiException invalidCredentials() {
        return new ApiException(
                HttpStatus.UNAUTHORIZED,
                "INVALID_CREDENTIALS",
                "이메일 또는 비밀번호를 확인해 주세요.");
    }
}
