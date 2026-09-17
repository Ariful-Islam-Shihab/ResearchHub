package com.researchhub.localbackend;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

@SpringBootApplication
public class LocalBackendApplication {

	public static void main(String[] args) {
		// Disable headless mode so we can open JFileChooser (Native OS Picker)
		System.setProperty("java.awt.headless", "false");
		SpringApplication.run(LocalBackendApplication.class, args);
	}

}
